import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CacheService } from '../../shared/services/cache.service';
import { CreateEventDto, CreateCategoryDto, CreateNomineeDto, EventStatus } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { VoteDto } from './dto/vote.dto';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) { }

  // Generate slug from title
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Create a new event
  async create(createEventDto: CreateEventDto, userId: number) {
    const slug = this.generateSlug(createEventDto.title);

    // Check if slug already exists
    const existing = await this.prisma.$queryRaw`
      SELECT id FROM ak_events WHERE slug = ${slug}
    `;
    if ((existing as any[]).length > 0) {
      throw new BadRequestException('Un événement avec ce titre existe déjà');
    }

    // Create event
    const [event] = await this.prisma.$queryRaw<any[]>`
      INSERT INTO ak_events (title, slug, description, image, year, top_number, topic_id, media_type, event_type, voting_start, voting_end, results_visible, notify_users, created_by, created_at, updated_at)
      VALUES (
        ${createEventDto.title},
        ${slug},
        ${createEventDto.description || null},
        ${createEventDto.image || null},
        ${createEventDto.year || null},
        ${createEventDto.topNumber || null},
        ${createEventDto.topicId || null},
        ${createEventDto.mediaType || 'mixed'},
        ${createEventDto.eventType || 'awards'},
        ${createEventDto.votingStart ? new Date(createEventDto.votingStart) : null},
        ${createEventDto.votingEnd ? new Date(createEventDto.votingEnd) : null},
        ${createEventDto.resultsVisible ?? false},
        ${createEventDto.notifyUsers ?? true},
        ${userId},
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    // Create categories if provided
    if (createEventDto.categories?.length) {
      for (const category of createEventDto.categories) {
        await this.createCategory(event.id, category);
      }
    }

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return this.findOne(event.id);
  }

  // Create a category for an event
  async createCategory(eventId: number, categoryDto: CreateCategoryDto) {
    const [category] = await this.prisma.$queryRaw<any[]>`
      INSERT INTO ak_event_categories (event_id, name, description, position, max_votes, created_at)
      VALUES (
        ${eventId},
        ${categoryDto.name},
        ${categoryDto.description || null},
        ${categoryDto.position || 0},
        ${categoryDto.maxVotes || 1},
        NOW()
      )
      RETURNING *
    `;

    // Create nominees if provided
    if (categoryDto.nominees?.length) {
      for (const nominee of categoryDto.nominees) {
        await this.createNominee(category.id, nominee);
      }
    }

    return category;
  }

  // Create a nominee for a category
  async createNominee(categoryId: number, nomineeDto: CreateNomineeDto) {
    const [nominee] = await this.prisma.$queryRaw<any[]>`
      INSERT INTO ak_event_nominees (category_id, anime_id, manga_id, game_id, custom_title, custom_image, custom_description, position, created_at)
      VALUES (
        ${categoryId},
        ${nomineeDto.animeId || null},
        ${nomineeDto.mangaId || null},
        ${nomineeDto.gameId || null},
        ${nomineeDto.customTitle || null},
        ${nomineeDto.customImage || null},
        ${nomineeDto.customDescription || null},
        ${nomineeDto.position || 0},
        NOW()
      )
      RETURNING *
    `;

    return nominee;
  }

  // Get all events (public)
  async findAll(status?: string) {
    // Create cache key based on status filter
    const cacheKey = status ? `events:status:${status}` : 'events:public';

    // Try to get from cache first (5 minutes TTL)
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // When no status is provided, show active, voting, and closed events from last 2 weeks
    // When status='closed' is explicitly requested, show all closed events
    let statusFilter: string;
    if (status === 'closed') {
      statusFilter = `AND status = 'closed'`;
    } else if (status) {
      statusFilter = `AND status = '${status}'`;
    } else {
      // For homepage/public: show active, voting, and recently closed (within 2 weeks)
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      statusFilter = `AND (
        status IN ('active', 'voting')
        OR (status = 'closed' AND updated_at >= '${twoWeeksAgo.toISOString()}')
      )`;
    }

    const events = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT e.*,
        (SELECT COUNT(*) FROM ak_event_categories WHERE event_id = e.id) as categories_count,
        (SELECT COUNT(*) FROM ak_event_votes v
          JOIN ak_event_nominees n ON v.nominee_id = n.id
          JOIN ak_event_categories c ON n.category_id = c.id
          WHERE c.event_id = e.id) as total_votes
      FROM ak_events e
      WHERE 1=1 ${statusFilter}
      ORDER BY
        CASE status
          WHEN 'voting' THEN 1
          WHEN 'active' THEN 2
          WHEN 'closed' THEN 3
          ELSE 4
        END,
        created_at DESC
    `);

    // Cache for 5 minutes (300 seconds)
    await this.cacheService.set(cacheKey, events, 300);

    return events;
  }

  // Get all events for admin
  async findAllAdmin() {
    const events = await this.prisma.$queryRaw<any[]>`
      SELECT e.*,
        (SELECT COUNT(*) FROM ak_event_categories WHERE event_id = e.id) as categories_count,
        (SELECT COUNT(*) FROM ak_event_votes v
          JOIN ak_event_nominees n ON v.nominee_id = n.id
          JOIN ak_event_categories c ON n.category_id = c.id
          WHERE c.event_id = e.id) as total_votes
      FROM ak_events e
      ORDER BY created_at DESC
    `;

    return events;
  }

  // Get single event by ID or slug
  async findOne(idOrSlug: number | string, userId?: number, isAdmin?: boolean) {
    const isId = typeof idOrSlug === 'number' || !isNaN(Number(idOrSlug));

    let event: any;
    if (isId) {
      const [result] = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM ak_events WHERE id = ${Number(idOrSlug)}
      `;
      event = result;
    } else {
      const [result] = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM ak_events WHERE slug = ${idOrSlug}
      `;
      event = result;
    }

    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Get categories with nominees and vote counts
    const categories = await this.prisma.$queryRaw<any[]>`
      SELECT c.*,
        (SELECT COUNT(*) FROM ak_event_votes WHERE category_id = c.id) as total_votes
      FROM ak_event_categories c
      WHERE c.event_id = ${event.id}
      ORDER BY c.position ASC, c.id ASC
    `;

    // Get nominees for each category
    for (const category of categories) {
      const nominees = await this.prisma.$queryRaw<any[]>`
        SELECT n.*,
          (SELECT COUNT(*) FROM ak_event_votes WHERE nominee_id = n.id) as vote_count,
          a.titre as anime_titre, a.image as anime_image,
          m.titre as manga_titre, m.image as manga_image,
          g.titre as game_titre, g.image as game_image
        FROM ak_event_nominees n
        LEFT JOIN ak_animes a ON n.anime_id = a.id_anime
        LEFT JOIN ak_mangas m ON n.manga_id = m.id_manga
        LEFT JOIN ak_jeux_video g ON n.game_id = g.id_jeu
        WHERE n.category_id = ${category.id}
        ORDER BY n.position ASC, n.id ASC
      `;

      // Check if user has voted in this category
      if (userId) {
        const [userVote] = await this.prisma.$queryRaw<any[]>`
          SELECT nominee_id FROM ak_event_votes
          WHERE category_id = ${category.id} AND user_id = ${userId}
        `;
        category.userVote = userVote?.nominee_id || null;
      }

      // For admin, get voter details for each category
      if (isAdmin) {
        const voters = await this.prisma.$queryRaw<any[]>`
          SELECT
            v.user_id,
            v.nominee_id,
            u.member_name as username,
            v.voted_at
          FROM ak_event_votes v
          JOIN smf_members u ON v.user_id = u.id_member
          WHERE v.category_id = ${category.id}
          ORDER BY v.voted_at DESC
        `;
        category.voters = voters;
      }

      category.nominees = nominees;
    }

    event.categories = categories;

    return event;
  }

  // Update event
  async update(id: number, updateEventDto: UpdateEventDto) {
    const event = await this.findOne(id);

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (updateEventDto.title !== undefined) {
      updates.push('title = $' + (values.length + 1));
      values.push(updateEventDto.title);
      updates.push('slug = $' + (values.length + 1));
      values.push(this.generateSlug(updateEventDto.title));
    }
    if (updateEventDto.description !== undefined) {
      updates.push('description = $' + (values.length + 1));
      values.push(updateEventDto.description);
    }
    if (updateEventDto.image !== undefined) {
      updates.push('image = $' + (values.length + 1));
      values.push(updateEventDto.image);
    }
    if (updateEventDto.year !== undefined) {
      updates.push('year = $' + (values.length + 1));
      values.push(updateEventDto.year);
    }
    if (updateEventDto.topNumber !== undefined) {
      updates.push('top_number = $' + (values.length + 1));
      values.push(updateEventDto.topNumber);
    }
    if (updateEventDto.topicId !== undefined) {
      updates.push('topic_id = $' + (values.length + 1));
      values.push(updateEventDto.topicId);
    }
    if (updateEventDto.mediaType !== undefined) {
      updates.push('media_type = $' + (values.length + 1));
      values.push(updateEventDto.mediaType);
    }
    if (updateEventDto.eventType !== undefined) {
      updates.push('event_type = $' + (values.length + 1));
      values.push(updateEventDto.eventType);
    }
    if (updateEventDto.status !== undefined) {
      updates.push('status = $' + (values.length + 1));
      values.push(updateEventDto.status);
    }
    if (updateEventDto.votingStart !== undefined) {
      updates.push('voting_start = $' + (values.length + 1));
      values.push(updateEventDto.votingStart ? new Date(updateEventDto.votingStart) : null);
    }
    if (updateEventDto.votingEnd !== undefined) {
      updates.push('voting_end = $' + (values.length + 1));
      values.push(updateEventDto.votingEnd ? new Date(updateEventDto.votingEnd) : null);
    }
    if (updateEventDto.resultsVisible !== undefined) {
      updates.push('results_visible = $' + (values.length + 1));
      values.push(updateEventDto.resultsVisible);
    }
    if (updateEventDto.notifyUsers !== undefined) {
      updates.push('notify_users = $' + (values.length + 1));
      values.push(updateEventDto.notifyUsers);
    }

    updates.push('updated_at = NOW()');

    if (updates.length > 1) {
      const query = `UPDATE ak_events SET ${updates.join(', ')} WHERE id = $${values.length + 1} RETURNING *`;
      values.push(id);
      await this.prisma.$queryRawUnsafe(query, ...values);
    }

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return this.findOne(id);
  }

  // Delete event
  async remove(id: number) {
    await this.findOne(id); // Check exists
    await this.prisma.$queryRaw`DELETE FROM ak_events WHERE id = ${id}`;

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return { success: true };
  }

  // Vote for a nominee
  async vote(voteDto: VoteDto, userId: number) {
    // Get the category and event
    const [category] = await this.prisma.$queryRaw<any[]>`
      SELECT c.*, e.status, e.voting_start, e.voting_end
      FROM ak_event_categories c
      JOIN ak_events e ON c.event_id = e.id
      WHERE c.id = ${voteDto.categoryId}
    `;

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Check if voting is open
    if (category.status !== 'voting') {
      throw new ForbiddenException('Les votes ne sont pas ouverts pour cet événement');
    }

    const now = new Date();
    if (category.voting_start && new Date(category.voting_start) > now) {
      throw new ForbiddenException('Les votes n\'ont pas encore commencé');
    }
    if (category.voting_end && new Date(category.voting_end) < now) {
      throw new ForbiddenException('Les votes sont terminés');
    }

    // Check if nominee belongs to category
    const [nominee] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM ak_event_nominees WHERE id = ${voteDto.nomineeId} AND category_id = ${voteDto.categoryId}
    `;

    if (!nominee) {
      throw new NotFoundException('Nominé non trouvé dans cette catégorie');
    }

    // Check if user already voted in this category
    const [existingVote] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM ak_event_votes WHERE category_id = ${voteDto.categoryId} AND user_id = ${userId}
    `;

    if (existingVote) {
      // Update existing vote
      await this.prisma.$queryRaw`
        UPDATE ak_event_votes
        SET nominee_id = ${voteDto.nomineeId}, voted_at = NOW()
        WHERE category_id = ${voteDto.categoryId} AND user_id = ${userId}
      `;
    } else {
      // Create new vote
      await this.prisma.$queryRaw`
        INSERT INTO ak_event_votes (nominee_id, category_id, user_id, voted_at)
        VALUES (${voteDto.nomineeId}, ${voteDto.categoryId}, ${userId}, NOW())
      `;
    }

    return { success: true, message: 'Vote enregistré' };
  }

  // Remove vote
  async removeVote(categoryId: number, userId: number) {
    await this.prisma.$queryRaw`
      DELETE FROM ak_event_votes WHERE category_id = ${categoryId} AND user_id = ${userId}
    `;
    return { success: true };
  }

  // Get user's votes for an event
  async getUserVotes(eventId: number, userId: number) {
    const votes = await this.prisma.$queryRaw<any[]>`
      SELECT v.*, c.name as category_name
      FROM ak_event_votes v
      JOIN ak_event_categories c ON v.category_id = c.id
      WHERE c.event_id = ${eventId} AND v.user_id = ${userId}
    `;
    return votes;
  }

  // Update event statuses based on dates (called by cron)
  async updateEventStatuses() {
    const now = new Date();

    // Set to voting if voting_start has passed
    await this.prisma.$queryRaw`
      UPDATE ak_events
      SET status = 'voting', updated_at = NOW()
      WHERE status = 'active'
        AND voting_start IS NOT NULL
        AND voting_start <= ${now}
    `;

    // Set to closed if voting_end has passed
    await this.prisma.$queryRaw`
      UPDATE ak_events
      SET status = 'closed', updated_at = NOW()
      WHERE status = 'voting'
        AND voting_end IS NOT NULL
        AND voting_end <= ${now}
    `;

    // Invalidate events cache since statuses changed
    await this.cacheService.invalidateAllEvents();

    return { success: true };
  }

  // Add category to existing event
  async addCategory(eventId: number, categoryDto: CreateCategoryDto) {
    await this.findOne(eventId); // Check event exists
    const result = await this.createCategory(eventId, categoryDto);

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return result;
  }

  // Update category
  async updateCategory(categoryId: number, categoryDto: Partial<CreateCategoryDto>) {
    const [category] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM ak_event_categories WHERE id = ${categoryId}
    `;

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    await this.prisma.$queryRaw`
      UPDATE ak_event_categories
      SET
        name = COALESCE(${categoryDto.name}, name),
        description = COALESCE(${categoryDto.description}, description),
        position = COALESCE(${categoryDto.position}, position),
        max_votes = COALESCE(${categoryDto.maxVotes}, max_votes)
      WHERE id = ${categoryId}
    `;

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return this.prisma.$queryRaw<any[]>`SELECT * FROM ak_event_categories WHERE id = ${categoryId}`;
  }

  // Delete category
  async removeCategory(categoryId: number) {
    await this.prisma.$queryRaw`DELETE FROM ak_event_categories WHERE id = ${categoryId}`;

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return { success: true };
  }

  // Add nominee to category
  async addNominee(categoryId: number, nomineeDto: CreateNomineeDto) {
    const [category] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM ak_event_categories WHERE id = ${categoryId}
    `;

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    const result = await this.createNominee(categoryId, nomineeDto);

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return result;
  }

  // Delete nominee
  async removeNominee(nomineeId: number) {
    await this.prisma.$queryRaw`DELETE FROM ak_event_nominees WHERE id = ${nomineeId}`;

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return { success: true };
  }

  // ============ EVENT SUBSCRIPTIONS ============

  // Subscribe to event notifications
  async subscribeToEvent(eventId: number, userId: number, notifyStart = true, notifyEnd = true) {
    // Check if event exists
    await this.findOne(eventId);

    // Create or update subscription
    await this.prisma.$executeRaw`
      INSERT INTO ak_event_subscriptions (user_id, event_id, notify_start, notify_end, created_at)
      VALUES (${userId}, ${eventId}, ${notifyStart}, ${notifyEnd}, NOW())
      ON CONFLICT (user_id, event_id)
      DO UPDATE SET
        notify_start = ${notifyStart},
        notify_end = ${notifyEnd}
    `;

    return {
      success: true,
      message: 'Abonné aux notifications de l\'événement',
    };
  }

  // Unsubscribe from event notifications
  async unsubscribeFromEvent(eventId: number, userId: number) {
    await this.prisma.$executeRaw`
      DELETE FROM ak_event_subscriptions
      WHERE user_id = ${userId} AND event_id = ${eventId}
    `;

    return {
      success: true,
      message: 'Désabonné des notifications de l\'événement',
    };
  }

  // Check if user is subscribed to event
  async checkSubscription(eventId: number, userId: number) {
    const [subscription] = await this.prisma.$queryRaw<any[]>`
      SELECT notify_start, notify_end, created_at
      FROM ak_event_subscriptions
      WHERE user_id = ${userId} AND event_id = ${eventId}
    `;

    return {
      subscribed: !!subscription,
      notifyStart: subscription?.notify_start || false,
      notifyEnd: subscription?.notify_end || false,
    };
  }

  // Get all subscribed users for an event
  async getEventSubscribers(eventId: number, notificationType: 'start' | 'end') {
    const notifyColumn = notificationType === 'start' ? 'notify_start' : 'notify_end';

    const subscribers = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT user_id
      FROM ak_event_subscriptions
      WHERE event_id = ${eventId} AND ${notifyColumn} = true
    `);

    return subscribers.map((s) => s.user_id);
  }

  // Get top X media by criteria (score or popularity) filtered by year
  async getTopMedia(
    mediaType: 'anime' | 'manga' | 'game',
    count: number,
    criteria: 'score' | 'popularity',
    year?: number,
  ) {
    const tableConfig = {
      anime: {
        table: 'ak_animes',
        idColumn: 'id_anime',
        titleColumn: 'titre',
        imageColumn: 'image',
        scoreColumn: 'moyennenotes',
        popularityColumn: 'nb_reviews',
        yearColumn: 'annee',
      },
      manga: {
        table: 'ak_mangas',
        idColumn: 'id_manga',
        titleColumn: 'titre',
        imageColumn: 'image',
        scoreColumn: 'moyennenotes',
        popularityColumn: 'nb_reviews',
        yearColumn: 'annee',
      },
      game: {
        table: 'ak_jeux_video',
        idColumn: 'id_jeu',
        titleColumn: 'titre',
        imageColumn: 'image',
        scoreColumn: 'moyenne_notes',
        popularityColumn: 'nb_reviews',
        yearColumn: 'annee',
      },
    };

    const config = tableConfig[mediaType];
    if (!config) {
      throw new BadRequestException('Invalid media type. Must be anime, manga, or game.');
    }

    const orderColumn = criteria === 'score' ? config.scoreColumn : config.popularityColumn;

    // Build query with year filter
    let whereClause = 'WHERE statut = 1';
    const params: any[] = [];

    if (year) {
      // Use text cast for year comparison to handle both Int and VarChar(4) without type errors
      whereClause += ` AND CAST(${config.yearColumn} AS TEXT) = $1`;
      params.push(year.toString());
    }

    // Relax requirements to ensure some results even for new items or years with few data
    if (criteria === 'score') {
      whereClause += ` AND ${config.scoreColumn} > 0`;
    }
    // We no longer require popularity > 0; the ORDER BY ${orderColumn} DESC will still put most popular first

    const limitParam = year ? '$2' : '$1';
    params.push(count);

    const query = `
      SELECT
        ${config.idColumn} as id,
        ${config.titleColumn} as titre,
        ${config.imageColumn} as image,
        ${config.scoreColumn} as score,
        ${config.popularityColumn} as popularity
      FROM ${config.table}
      ${whereClause}
      ORDER BY ${orderColumn} DESC NULLS LAST
      LIMIT ${limitParam}
    `;

    const results = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);

    return results.map((item) => ({
      id: Number(item.id),
      titre: item.titre,
      image: item.image,
      score: Number(item.score) || 0,
      popularity: Number(item.popularity) || 0,
      type: mediaType,
    }));
  }

  // Auto-populate a category with top media
  async autoPopulateCategory(
    categoryId: number,
    mediaType: 'anime' | 'manga' | 'game',
    count: number,
    criteria: 'score' | 'popularity',
    year?: number,
  ) {
    // Check category exists
    const [category] = await this.prisma.$queryRaw<any[]>`
      SELECT c.*, e.event_type, e.media_type as event_media_type
      FROM ak_event_categories c
      JOIN ak_events e ON c.event_id = e.id
      WHERE c.id = ${categoryId}
    `;

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Get top media
    const topMedia = await this.getTopMedia(mediaType, count, criteria, year);

    // Add each media as nominee
    let addedCount = 0;
    for (let i = 0; i < topMedia.length; i++) {
      const media = topMedia[i];

      // Build nominee data based on media type
      const nomineeDto: CreateNomineeDto = {
        position: i + 1,
      };

      if (mediaType === 'anime') {
        nomineeDto.animeId = media.id;
      } else if (mediaType === 'manga') {
        nomineeDto.mangaId = media.id;
      } else if (mediaType === 'game') {
        nomineeDto.gameId = media.id;
      }

      await this.createNominee(categoryId, nomineeDto);
      addedCount++;
    }

    // Invalidate events cache
    await this.cacheService.invalidateAllEvents();

    return {
      success: true,
      message: `${addedCount} nominés ajoutés`,
      count: addedCount,
    };
  }
}
