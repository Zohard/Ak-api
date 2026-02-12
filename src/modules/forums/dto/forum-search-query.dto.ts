import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForumSearchQueryDto {
    @IsString()
    q: string;

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 20;

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt()
    @Min(0)
    offset?: number = 0;

    @IsOptional()
    @IsString()
    @IsIn(['all', 'subject', 'content'])
    searchIn?: 'all' | 'subject' | 'content' = 'all';

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt()
    boardId?: number;
}
