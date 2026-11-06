import { PaginationMetaDto } from '../dto/pagination-meta.dto';

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export function paginate<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
