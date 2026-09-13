import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAdmin() {
    const tags = await this.prisma.tag.findMany({
      orderBy: [{ name: 'asc' }, { slug: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { problems: true } },
      },
    });

    return {
      items: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
        problemCount: tag._count.problems,
      })),
    };
  }

  async createAdmin(dto: CreateTagDto) {
    try {
      const tag = await this.prisma.tag.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? this.slugify(dto.name),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { problems: true } },
        },
      });
      return this.formatTag(tag);
    } catch (error) {
      this.handleKnownTagWriteError(error);
    }
  }

  async updateAdmin(slug: string, dto: UpdateTagDto) {
    try {
      const tag = await this.prisma.tag.update({
        where: { slug },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.slug !== undefined && { slug: dto.slug }),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { problems: true } },
        },
      });
      return this.formatTag(tag);
    } catch (error) {
      this.handleKnownTagWriteError(error);
    }
  }

  private formatTag(tag: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { problems: number };
  }) {
    return {
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
      problemCount: tag._count.problems,
    };
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private handleKnownTagWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A tag with this slug already exists');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundException('Tag not found');
    }
    throw error;
  }
}
