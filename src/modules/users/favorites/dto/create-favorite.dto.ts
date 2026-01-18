import { IsString, IsInt, IsIn, IsPositive } from 'class-validator';

export class CreateFavoriteDto {
    @IsString()
    @IsIn(['anime', 'manga', 'jeu-video', 'business'])
    type: string;

    @IsInt()
    @IsPositive()
    idContent: number;
}
