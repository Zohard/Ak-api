import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateEventDto, CreateCategoryDto, CreateNomineeDto, EventStatus } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { VoteDto } from './dto/vote.dto';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

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
      INSERT INTO ak_events (title, slug, description, image, year, media_type, event_type, voting_start, voting_end, results_visible, notify_users, created_by, created_at, updated_at)
      VALUES (
        ${createEventDto.title},
        ${slug},
        ${createEventDto.description || null},
        ${createEventDto.image || null},
        ${createEventDto.year || null},
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
    const statusFilter = status ? `AND status = '${status}'` : `AND status IN ('active', 'voting', 'closed')`;

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
  async findOne(idOrSlug: number | string, userId?: number) {
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

    return this.findOne(id);
  }

  // Delete event
  async remove(id: number) {
    await this.findOne(id); // Check exists
    await this.prisma.$queryRaw`DELETE FROM ak_events WHERE id = ${id}`;
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

    return { success: true };
  }

  // Add category to existing event
  async addCategory(eventId: number, categoryDto: CreateCategoryDto) {
    await this.findOne(eventId); // Check event exists
    return this.createCategory(eventId, categoryDto);
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

    return this.prisma.$queryRaw<any[]>`SELECT * FROM ak_event_categories WHERE id = ${categoryId}`;
  }

  // Delete category
  async removeCategory(categoryId: number) {
    await this.prisma.$queryRaw`DELETE FROM ak_event_categories WHERE id = ${categoryId}`;
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

    return this.createNominee(categoryId, nomineeDto);
  }

  // Delete nominee
  async removeNominee(nomineeId: number) {
    await this.prisma.$queryRaw`DELETE FROM ak_event_nominees WHERE id = ${nomineeId}`;
    return { success: true };
  }
}
