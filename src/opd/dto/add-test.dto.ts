import { IsInt, IsOptional, IsString } from 'class-validator';

export class AddTestDto {
  @IsInt()
  test_id: number;

  @IsString()
  @IsOptional()
  status?: string = 'Ordered'; // Default
}
