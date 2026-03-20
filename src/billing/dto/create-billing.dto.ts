import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBillItemDto {
  @IsString()
  @IsNotEmpty()
  item_type: string; // 'Procedure' | 'Test' | 'Medicine' | 'Other'

  @IsInt()
  @IsOptional()
  reference_id?: number;

  @IsString()
  @IsNotEmpty()
  item_description: string;

  @IsInt()
  @IsNotEmpty()
  quantity: number;

  @IsNumber()
  @IsNotEmpty()
  unit_price: number;

  @IsNumber()
  @IsNotEmpty()
  total_price: number;
}

export class CreateBillingDto {
  @IsInt()
  @IsNotEmpty()
  hospital_id: number;

  @IsInt()
  @IsNotEmpty()
  visit_id: number;

  @IsNumber()
  @IsNotEmpty()
  subtotal_amount: number;

  @IsNumber()
  @IsOptional()
  tax_amount?: number;

  @IsNumber()
  @IsOptional()
  discount_amount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBillItemDto)
  items: CreateBillItemDto[];
}
