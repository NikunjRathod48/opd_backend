import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
} from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/roles.decorator';

@Controller('doctors')
@Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor', 'Receptionist')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post()
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin')
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Body() createDoctorDto: CreateDoctorDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.doctorsService.create(createDoctorDto, file);
  }

  @Get()
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor', 'Receptionist', 'Patient')
  findAll(@Query() query: any) {
    return this.doctorsService.findAll(query);
  }

  @Get('specializations')
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor', 'Receptionist', 'Patient')
  getSpecializations() {
    return this.doctorsService.getSpecializations();
  }

  @Get('departments/:hospitalId')
  getHospitalDepartments(
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
  ) {
    return this.doctorsService.getHospitalDepartments(hospitalId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.doctorsService.findOne(id);
  }

  @Put(':id')
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin')
  @UseInterceptors(FileInterceptor('file'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDoctorDto: UpdateDoctorDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.doctorsService.update(id, updateDoctorDto, file);
  }

  @Get(':id/availability')
  getAvailability(@Param('id', ParseIntPipe) id: number) {
    return this.doctorsService.getAvailability(id);
  }

  @Put(':id/availability')
  @Roles('Super Admin', 'Group Admin', 'Hospital Admin', 'Doctor')
  updateAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { schedule: any[] },
  ) {
    return this.doctorsService.updateAvailability(id, body.schedule);
  }
}
