import { IsString, IsInt, IsOptional, IsArray, IsBoolean, Min, Max, ArrayMinSize } from 'class-validator';

// DTOs for creating polls
export class PollChoiceDto {
  @IsString()
  label: string;
}

export class CreatePollDto {
  @IsString()
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  choices: PollChoiceDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(255)
  maxVotes?: number = 1;

  @IsOptional()
  @IsInt()
  expireTime?: number;

  @IsOptional()
  @IsBoolean()
  changeVote?: boolean = false;

  @IsOptional()
  @IsBoolean()
  guestVote?: boolean = false;

  @IsOptional()
  @IsInt()
  hideResults?: number = 0; // 0 = always show, 1 = show after vote, 2 = show after poll expires
}

// DTO for voting
export class VotePollDto {
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  choices: number[];
}

// Response DTOs
export interface PollChoiceResponse {
  id: number;
  label: string;
  votes: number;
  percentage: number;
  isUserChoice?: boolean;
}

export interface PollResponse {
  id: number;
  question: string;
  votingLocked: number;
  maxVotes: number;
  expireTime: number;
  hideResults: number;
  changeVote: number;
  guestVote: number;
  totalVotes: number;
  totalVoters: number;
  choices: PollChoiceResponse[];
  userVoted: boolean;
  userChoices?: number[];
  canVote: boolean;
  isExpired: boolean;
}
