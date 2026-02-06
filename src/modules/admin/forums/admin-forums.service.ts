import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../shared/services/prisma.service';
import {
  UpdateBoardPermissionsDto,
  BoardPermissionInfo,
  MemberGroupInfo,
  ForumPermissionsResponse
} from './dto/forum-permissions.dto';

@Injectable()
export class AdminForumsService {
  private readonly logger = new Logger(AdminForumsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getForumPermissions(): Promise<ForumPermissionsResponse> {
    try {
      const [boards, memberGroups] = await Promise.all([
        this.getBoardsWithPermissions(),
        this.getMemberGroups()
      ]);

      return {
        boards,
        memberGroups
      };
    } catch (error) {
      this.logger.error('Error fetching forum permissions:', error);
      throw error;
    }
  }

  async getBoardsWithPermissions(): Promise<BoardPermissionInfo[]> {
    try {
      const boards = await this.prisma.smfBoard.findMany({
        include: {
          category: true
        },
        orderBy: [
          { category: { catOrder: 'asc' } },
          { boardOrder: 'asc' }
        ]
      });

      return boards.map(board => ({
        id: board.idBoard,
        name: board.name,
        description: board.description || '',
        categoryName: board.category.name,
        allowedGroups: board.memberGroups || '-1,0',
        deniedGroups: '',
        numTopics: board.numTopics,
        numPosts: board.numPosts
      }));
    } catch (error) {
      this.logger.error('Error fetching boards with permissions:', error);
      throw error;
    }
  }

  async getMemberGroups(): Promise<MemberGroupInfo[]> {
    try {
      const groups = await this.prisma.smfMembergroup.findMany({
        orderBy: { idGroup: 'asc' }
      });

      // Get member counts for each group
      const groupsWithCounts = await Promise.all(
        groups.map(async (group) => {
          const memberCount = await this.prisma.smfMember.count({
            where: {
              OR: [
                { idGroup: group.idGroup },
                { idPostGroup: group.idGroup },
                { additionalGroups: { contains: group.idGroup.toString() } }
              ]
            }
          });

          return {
            id: group.idGroup,
            name: group.groupName,
            color: group.onlineColor || '#000000',
            description: group.description || '',
            memberCount
          };
        })
      );

      // Add special groups that might not be in the membergroups table
      const specialGroups: MemberGroupInfo[] = [
        {
          id: -1,
          name: 'All Groups',
          color: '#007bff',
          description: 'All membergroups (everyone including guests)',
          memberCount: await this.prisma.smfMember.count()
        },
        {
          id: 0,
          name: 'Guests',
          color: '#6c757d',
          description: 'Unregistered visitors',
          memberCount: 0
        }
      ];

      return [...specialGroups, ...groupsWithCounts];
    } catch (error) {
      this.logger.error('Error fetching member groups:', error);
      throw error;
    }
  }

  async updateBoardPermissions(dto: UpdateBoardPermissionsDto): Promise<BoardPermissionInfo> {
    try {
      // Validate that the board exists
      const existingBoard = await this.prisma.smfBoard.findUnique({
        where: { idBoard: dto.boardId },
        include: { category: true }
      });

      if (!existingBoard) {
        throw new NotFoundException(`Board with ID ${dto.boardId} not found`);
      }

      // Validate group IDs format
      this.validateGroupIds(dto.allowedGroups);
      if (dto.deniedGroups) {
        this.validateGroupIds(dto.deniedGroups);
      }

      // Update the board permissions
      const updatedBoard = await this.prisma.smfBoard.update({
        where: { idBoard: dto.boardId },
        data: {
          memberGroups: dto.allowedGroups
          // denyMemberGroups column does not exist in database
        },
        include: { category: true }
      });

      this.logger.log(`Updated permissions for board ${dto.boardId}: allowed=[${dto.allowedGroups}], denied=[${dto.deniedGroups || 'none'}]`);

      return {
        id: updatedBoard.idBoard,
        name: updatedBoard.name,
        description: updatedBoard.description || '',
        categoryName: updatedBoard.category.name,
        allowedGroups: updatedBoard.memberGroups || '',
        deniedGroups: '', // Column does not exist in database
        numTopics: updatedBoard.numTopics,
        numPosts: updatedBoard.numPosts
      };
    } catch (error) {
      this.logger.error('Error updating board permissions:', error);
      throw error;
    }
  }

  async getQuickPermissionTemplates(): Promise<{ [key: string]: { allowed: string; denied: string; description: string } }> {
    return {
      public: {
        allowed: '-1,0',
        denied: '',
        description: 'Public access for all users including guests'
      },
      membersOnly: {
        allowed: '1,2,3,4',
        denied: '0',
        description: 'Registered members only (no guests)'
      },
      staffOnly: {
        allowed: '1,2,3',
        denied: '',
        description: 'Staff only (admins, global mods, moderators)'
      },
      adminOnly: {
        allowed: '1',
        denied: '',
        description: 'Administrators only'
      },
      teamAK: {
        allowed: '1,2,3,9,11,12,13',
        denied: '',
        description: 'Team AK members only'
      }
    };
  }

  async applyPermissionTemplate(boardId: number, templateName: string): Promise<BoardPermissionInfo> {
    const templates = await this.getQuickPermissionTemplates();
    const template = templates[templateName];

    if (!template) {
      throw new BadRequestException(`Unknown permission template: ${templateName}`);
    }

    return this.updateBoardPermissions({
      boardId,
      allowedGroups: template.allowed,
      deniedGroups: template.denied
    });
  }

  private validateGroupIds(groupIds: string): void {
    if (!groupIds.trim()) {
      throw new BadRequestException('Group IDs cannot be empty');
    }

    const groups = groupIds.split(',').map(id => id.trim());

    for (const group of groups) {
      const groupId = parseInt(group);
      if (isNaN(groupId) && group !== '-1') {
        throw new BadRequestException(`Invalid group ID: ${group}`);
      }
    }
  }

  async getBoardPermissionSummary(boardId: number): Promise<{
    board: BoardPermissionInfo;
    allowedGroupNames: string[];
    deniedGroupNames: string[];
  }> {
    try {
      const board = await this.prisma.smfBoard.findUnique({
        where: { idBoard: boardId },
        include: { category: true }
      });

      if (!board) {
        throw new NotFoundException(`Board with ID ${boardId} not found`);
      }

      const [allowedGroupNames, deniedGroupNames] = await Promise.all([
        this.getGroupNames(board.memberGroups),
        Promise.resolve([]) // deny_member_groups column does not exist
      ]);

      return {
        board: {
          id: board.idBoard,
          name: board.name,
          description: board.description || '',
          categoryName: board.category.name,
          allowedGroups: board.memberGroups || '',
          deniedGroups: '',
          numTopics: board.numTopics,
          numPosts: board.numPosts
        },
        allowedGroupNames,
        deniedGroupNames
      };
    } catch (error) {
      this.logger.error('Error getting board permission summary:', error);
      throw error;
    }
  }

  async recomputeLastMessages(): Promise<{ topicsUpdated: number; boardsUpdated: number }> {
    this.logger.log('Starting recomputation of last messages for topics and boards...');

    // Fix topics: set id_first_msg and id_last_msg based on actual messages
    const topicResult = await this.prisma.$executeRawUnsafe(`
      UPDATE smf_topics
      SET id_first_msg = m.first_msg,
          id_last_msg = m.last_msg
      FROM (
        SELECT id_topic,
               MIN(id_msg) AS first_msg,
               MAX(id_msg) AS last_msg
        FROM smf_messages
        GROUP BY id_topic
      ) m
      WHERE smf_topics.id_topic = m.id_topic
    `);

    this.logger.log(`Topics updated: ${topicResult}`);

    // Fix boards: set id_last_msg based on actual messages in that board
    const boardResult = await this.prisma.$executeRawUnsafe(`
      UPDATE smf_boards
      SET id_last_msg = m.last_msg
      FROM (
        SELECT id_board,
               MAX(id_msg) AS last_msg
        FROM smf_messages
        GROUP BY id_board
      ) m
      WHERE smf_boards.id_board = m.id_board
    `);

    this.logger.log(`Boards updated: ${boardResult}`);

    // Also fix num_replies on topics (num_replies = total messages - 1 for the first message)
    await this.prisma.$executeRawUnsafe(`
      UPDATE smf_topics
      SET num_replies = m.reply_count
      FROM (
        SELECT id_topic, COUNT(*) - 1 AS reply_count
        FROM smf_messages
        GROUP BY id_topic
      ) m
      WHERE smf_topics.id_topic = m.id_topic
    `);

    // Fix num_topics and num_posts on boards
    await this.prisma.$executeRawUnsafe(`
      UPDATE smf_boards
      SET num_topics = m.topic_count,
          num_posts = m.post_count
      FROM (
        SELECT id_board,
               COUNT(DISTINCT id_topic) AS topic_count,
               COUNT(*) AS post_count
        FROM smf_messages
        GROUP BY id_board
      ) m
      WHERE smf_boards.id_board = m.id_board
    `);

    this.logger.log('Recomputation of last messages completed.');

    return {
      topicsUpdated: topicResult as number,
      boardsUpdated: boardResult as number,
    };
  }

  private async getGroupNames(groupIds?: string): Promise<string[]> {
    if (!groupIds || !groupIds.trim()) {
      return [];
    }

    const ids = groupIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    const names: string[] = [];

    for (const id of ids) {
      if (id === -1) {
        names.push('All Groups');
      } else if (id === 0) {
        names.push('Guests');
      } else {
        const group = await this.prisma.smfMembergroup.findUnique({
          where: { idGroup: id }
        });
        names.push(group?.groupName || `Group ${id}`);
      }
    }

    return names;
  }
}