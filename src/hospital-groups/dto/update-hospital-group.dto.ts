import { PartialType } from '@nestjs/mapped-types';
import { CreateHospitalGroupDto } from './create-hospital-group.dto';

export class UpdateHospitalGroupDto extends PartialType(
  CreateHospitalGroupDto,
) {}
