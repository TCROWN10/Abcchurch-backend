import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class ZodPipe implements PipeTransform {
  constructor(private readonly zod: z.ZodSchema) {}
  async transform(value: any, metadata: ArgumentMetadata) {
    try{
      return await this.zod.parseAsync(value);
    }catch(error) {
      throw new BadRequestException(error.message);
    }
  }
}
