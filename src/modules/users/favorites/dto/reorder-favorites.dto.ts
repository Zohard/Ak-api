import { IsArray, IsInt, IsNotEmpty } from 'class-validator';

export class ReorderFavoritesDto {
    @IsArray()
    @IsInt({ each: true })
    @IsNotEmpty()
    ids: number[];
}
