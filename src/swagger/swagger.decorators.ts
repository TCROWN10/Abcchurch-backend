// Common Swagger decorators and DTOs for API documentation

import { ApiProperty, } from '@nestjs/swagger';

export class AppResponseDto<T> {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  data: T;

  @ApiProperty()
  message: string;

  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  timestamp: string;

  @ApiProperty()
  path: string;
}

export class ErrorResponseDto {
  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  message: string;

  @ApiProperty()
  path: string;

  @ApiProperty()
  timestamp: string;
}

