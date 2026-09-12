import { IsUUID, IsDateString, IsArray } from 'class-validator';

export class AssignRouteDto {
  @IsUUID()
  collectorId: string;

  @IsDateString()
  routeDate: string;

  @IsArray()
  @IsUUID('4', { each: true })
  loanIds: string[];
}
