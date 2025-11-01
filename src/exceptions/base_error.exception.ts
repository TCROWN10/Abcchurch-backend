import { HttpException } from "@nestjs/common";


export class BaseError extends HttpException {
    constructor(message: string, status: number) {
        super(message, status);
    }
}