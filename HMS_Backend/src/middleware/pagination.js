/**
 * Pagination middleware
 * Parses and validates pagination parameters
 */
const pagination = (options = {}) => {
  const {
    defaultLimit = 50,
    maxLimit = 100,
    defaultPage = 1,
    defaultSort = 'created_at',
    defaultOrder = 'DESC'
  } = options;

  return (req, res, next) => {
    // Parse pagination parameters
    const page = parseInt(req.query.page) || defaultPage;
    const limit = Math.min(
      parseInt(req.query.limit) || defaultLimit,
      maxLimit
    );
    const offset = (page - 1) * limit;

    // Parse sorting parameters
    const sortBy = req.query.sort_by || defaultSort;
    const sortOrder = req.query.sort_order?.toUpperCase() === 'ASC' ? 'ASC' : defaultOrder;

    // Attach pagination info to request
    req.pagination = {
      page,
      limit,
      offset,
      sortBy,
      sortOrder
    };

    // Attach pagination helper to response
    res.paginate = (data, total) => {
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    };

    next();
  };
};

/**
 * Cursor-based pagination (for infinite scroll)
 */
const cursorPagination = (options = {}) => {
  const {
    defaultLimit = 50,
    maxLimit = 100,
    cursorField = 'id'
  } = options;

  return (req, res, next) => {
    const limit = Math.min(
      parseInt(req.query.limit) || defaultLimit,
      maxLimit
    );
    const cursor = req.query.cursor;
    const direction = req.query.direction || 'next';

    req.cursorPagination = {
      limit,
      cursor,
      direction,
      cursorField
    };

    next();
  };
};

/**
 * Parse and validate filter parameters
 */
const filters = (allowedFilters = []) => {
  return (req, res, next) => {
    req.filters = {};

    for (const filter of allowedFilters) {
      const value = req.query[filter];
      if (value !== undefined && value !== null && value !== '') {
        // Handle special filter operators
        if (typeof value === 'string' && value.includes(',')) {
          req.filters[filter] = value.split(',');
        } else {
          req.filters[filter] = value;
        }
      }
    }

    next();
  };
};

/**
 * Parse range filters (e.g., date ranges, price ranges)
 */
const rangeFilters = (ranges = []) => {
  return (req, res, next) => {
    req.ranges = {};

    for (const range of ranges) {
      const min = req.query[`${range}_min`];
      const max = req.query[`${range}_max`];

      if (min !== undefined || max !== undefined) {
        req.ranges[range] = {
          min: min ? parseFloat(min) : undefined,
          max: max ? parseFloat(max) : undefined
        };
      }
    }

    next();
  };
};

/**
 * Parse search query
 */
const search = (fields = []) => {
  return (req, res, next) => {
    const query = req.query.q || req.query.search;
    
    if (query && query.length > 0) {
      req.search = {
        query,
        fields,
        pattern: `%${query}%`
      };
    }

    next();
  };
};

/**
 * Build WHERE clause from filters
 */
const buildWhereClause = (filters, ranges, search, tableAlias = '') => {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // Add simple filters
  for (const [key, value] of Object.entries(filters || {})) {
    if (Array.isArray(value)) {
      // IN clause
      const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`${tableAlias}${key} IN (${placeholders})`);
      params.push(...value);
    } else {
      // Equality
      conditions.push(`${tableAlias}${key} = $${paramIndex++}`);
      params.push(value);
    }
  }

  // Add range filters
  for (const [key, range] of Object.entries(ranges || {})) {
    if (range.min !== undefined) {
      conditions.push(`${tableAlias}${key} >= $${paramIndex++}`);
      params.push(range.min);
    }
    if (range.max !== undefined) {
      conditions.push(`${tableAlias}${key} <= $${paramIndex++}`);
      params.push(range.max);
    }
  }

  // Add search
  if (search?.query && search.fields.length > 0) {
    const searchConditions = search.fields.map(field => 
      `${tableAlias}${field} ILIKE $${paramIndex}`
    );
    conditions.push(`(${searchConditions.join(' OR ')})`);
    params.push(search.pattern);
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
};

module.exports = {
  pagination,
  cursorPagination,
  filters,
  rangeFilters,
  search,
  buildWhereClause
};