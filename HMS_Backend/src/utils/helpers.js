/**
 * Helper utility functions for Hospital Management System
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 * @param {any} value - Value to check
 * @returns {boolean} - True if empty
 */
const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

/**
 * Check if value is not empty
 * @param {any} value - Value to check
 * @returns {boolean} - True if not empty
 */
const isNotEmpty = (value) => {
  return !isEmpty(value);
};

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} - Cloned object
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map((item) => deepClone(item));
  if (obj instanceof Object) {
    const cloned = {};
    Object.keys(obj).forEach((key) => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
  return obj;
};

/**
 * Merge objects deeply
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} - Merged object
 */
const deepMerge = (target, source) => {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
};

/**
 * Check if value is object
 * @param {any} value - Value to check
 * @returns {boolean} - True if object
 */
const isObject = (value) => {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
};

/**
 * Check if value is plain object
 * @param {any} value - Value to check
 * @returns {boolean} - True if plain object
 */
const isPlainObject = (value) => {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    !(value instanceof Map) &&
    !(value instanceof Set)
  );
};

/**
 * Pick specific keys from object
 * @param {Object} obj - Source object
 * @param {Array} keys - Keys to pick
 * @returns {Object} - New object with picked keys
 */
const pick = (obj, keys) => {
  return keys.reduce((acc, key) => {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
};

/**
 * Omit specific keys from object
 * @param {Object} obj - Source object
 * @param {Array} keys - Keys to omit
 * @returns {Object} - New object without omitted keys
 */
const omit = (obj, keys) => {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
};

/**
 * Group array of objects by key
 * @param {Array} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} - Grouped object
 */
const groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const groupKey = item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
};

/**
 * Group array of objects by multiple keys
 * @param {Array} array - Array to group
 * @param {Array} keys - Keys to group by
 * @returns {Object} - Nested grouped object
 */
const groupByMultiple = (array, keys) => {
  if (keys.length === 0) return array;

  const [firstKey, ...remainingKeys] = keys;
  const grouped = groupBy(array, firstKey);

  if (remainingKeys.length > 0) {
    Object.keys(grouped).forEach((key) => {
      grouped[key] = groupByMultiple(grouped[key], remainingKeys);
    });
  }

  return grouped;
};

/**
 * Chunk array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} - Array of chunks
 */
const chunkArray = (array, size) => {
  if (!Array.isArray(array) || size <= 0) return [];

  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Remove duplicates from array
 * @param {Array} array - Array to process
 * @returns {Array} - Array with unique values
 */
const uniqueArray = (array) => {
  return [...new Set(array)];
};

/**
 * Remove duplicates from array of objects by key
 * @param {Array} array - Array to process
 * @param {string} key - Key to check uniqueness
 * @returns {Array} - Array with unique objects
 */
const uniqueByKey = (array, key) => {
  const seen = new Set();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

/**
 * Sort array of objects by key
 * @param {Array} array - Array to sort
 * @param {string} key - Key to sort by
 * @param {string} order - Sort order ('asc' or 'desc')
 * @returns {Array} - Sorted array
 */
const sortByKey = (array, key, order = "asc") => {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal === bVal) return 0;

    const comparison = aVal > bVal ? 1 : -1;
    return order === "asc" ? comparison : -comparison;
  });
};

/**
 * Sort array of objects by multiple keys
 * @param {Array} array - Array to sort
 * @param {Array} keys - Keys to sort by (each can be string or {key, order})
 * @returns {Array} - Sorted array
 */
const sortByMultipleKeys = (array, keys) => {
  return [...array].sort((a, b) => {
    for (const keyConfig of keys) {
      let key,
        order = "asc";

      if (typeof keyConfig === "string") {
        key = keyConfig;
      } else {
        key = keyConfig.key;
        order = keyConfig.order || "asc";
      }

      const aVal = a[key];
      const bVal = b[key];

      if (aVal === bVal) continue;

      const comparison = aVal > bVal ? 1 : -1;
      return order === "asc" ? comparison : -comparison;
    }
    return 0;
  });
};

/**
 * Filter object by keys
 * @param {Object} obj - Object to filter
 * @param {Function} predicate - Filter predicate
 * @returns {Object} - Filtered object
 */
const filterObject = (obj, predicate) => {
  return Object.keys(obj)
    .filter((key) => predicate(key, obj[key]))
    .reduce((result, key) => {
      result[key] = obj[key];
      return result;
    }, {});
};

/**
 * Map object to array
 * @param {Object} obj - Object to map
 * @returns {Array} - Array of key-value pairs
 */
const objectToArray = (obj) => {
  return Object.keys(obj).map((key) => ({
    key,
    value: obj[key],
  }));
};

/**
 * Convert array to object
 * @param {Array} array - Array to convert
 * @param {string} keyField - Field to use as key
 * @returns {Object} - Object with keyField values as keys
 */
const arrayToObject = (array, keyField) => {
  return array.reduce((obj, item) => {
    obj[item[keyField]] = item;
    return obj;
  }, {});
};

/**
 * Flatten nested object
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Key prefix
 * @returns {Object} - Flattened object
 */
const flattenObject = (obj, prefix = "") => {
  return Object.keys(obj).reduce((acc, key) => {
    const pre = prefix.length ? `${prefix}.` : "";
    if (isObject(obj[key])) {
      Object.assign(acc, flattenObject(obj[key], `${pre}${key}`));
    } else {
      acc[`${pre}${key}`] = obj[key];
    }
    return acc;
  }, {});
};

/**
 * Unflatten object
 * @param {Object} obj - Flattened object
 * @returns {Object} - Unflattened object
 */
const unflattenObject = (obj) => {
  const result = {};

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

    const keys = key.split(".");
    let current = result;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = obj[key];
  }

  return result;
};

/**
 * Generate random string
 * @param {number} length - String length
 * @returns {string} - Random string
 */
const randomString = (length = 10) => {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
};

/**
 * Generate random number between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random number
 */
const randomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Generate UUID
 * @returns {string} - UUID v4
 */
const generateUUID = () => {
  return uuidv4();
};

/**
 * Calculate percentage
 * @param {number} value - Value
 * @param {number} total - Total
 * @returns {number} - Percentage
 */
const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return (value / total) * 100;
};

/**
 * Calculate average
 * @param {Array} numbers - Array of numbers
 * @returns {number} - Average
 */
const calculateAverage = (numbers) => {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return sum / numbers.length;
};

/**
 * Calculate weighted average
 * @param {Array} items - Array of items with value and weight
 * @returns {number} - Weighted average
 */
const calculateWeightedAverage = (items) => {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const totalWeight = items.reduce((acc, item) => acc + (item.weight || 1), 0);
  const weightedSum = items.reduce(
    (acc, item) => acc + item.value * (item.weight || 1),
    0
  );

  return weightedSum / totalWeight;
};

/**
 * Calculate median
 * @param {Array} numbers - Array of numbers
 * @returns {number} - Median
 */
const calculateMedian = (numbers) => {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
};

/**
 * Calculate mode
 * @param {Array} numbers - Array of numbers
 * @returns {Array} - Mode(s)
 */
const calculateMode = (numbers) => {
  if (!Array.isArray(numbers) || numbers.length === 0) return [];

  const frequency = {};
  let maxFreq = 0;
  let modes = [];

  numbers.forEach((num) => {
    frequency[num] = (frequency[num] || 0) + 1;
    if (frequency[num] > maxFreq) {
      maxFreq = frequency[num];
    }
  });

  for (const num in frequency) {
    if (frequency[num] === maxFreq) {
      modes.push(Number(num));
    }
  }

  return modes;
};

/**
 * Calculate standard deviation
 * @param {Array} numbers - Array of numbers
 * @returns {number} - Standard deviation
 */
const calculateStdDev = (numbers) => {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;

  const avg = calculateAverage(numbers);
  const squareDiffs = numbers.map((num) => Math.pow(num - avg, 2));
  const avgSquareDiff = calculateAverage(squareDiffs);

  return Math.sqrt(avgSquareDiff);
};

/**
 * Calculate variance
 * @param {Array} numbers - Array of numbers
 * @returns {number} - Variance
 */
const calculateVariance = (numbers) => {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;

  const avg = calculateAverage(numbers);
  const squareDiffs = numbers.map((num) => Math.pow(num - avg, 2));

  return calculateAverage(squareDiffs);
};

/**
 * Calculate correlation coefficient
 * @param {Array} x - First array of numbers
 * @param {Array} y - Second array of numbers
 * @returns {number} - Correlation coefficient
 */
const calculateCorrelation = (x, y) => {
  if (x.length !== y.length || x.length === 0) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, val, i) => acc + val * y[i], 0);
  const sumX2 = x.reduce((acc, val) => acc + val * val, 0);
  const sumY2 = y.reduce((acc, val) => acc + val * val, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after ms
 */
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} - Promise with function result
 */
const retry = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffFactor = 2,
    maxDelay = 30000,
    retryCondition = (error) => true,
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !retryCondition(error)) {
        throw error;
      }

      await sleep(delay);
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError;
};

/**
 * Debounce function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
const debounce = (fn, delay) => {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
};

/**
 * Throttle function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Limit in milliseconds
 * @returns {Function} - Throttled function
 */
const throttle = (fn, limit) => {
  let inThrottle;

  return (...args) => {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Memoize function results
 * @param {Function} fn - Function to memoize
 * @param {Function} keyGenerator - Key generator function
 * @returns {Function} - Memoized function
 */
const memoize = (fn, keyGenerator = (...args) => JSON.stringify(args)) => {
  const cache = new Map();

  return (...args) => {
    const key = keyGenerator(...args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
};

/**
 * Parse query string to object
 * @param {string} query - Query string
 * @returns {Object} - Parsed query object
 */
const parseQueryString = (query) => {
  if (!query) return {};

  // Remove leading '?' if present
  const cleanQuery = query.startsWith("?") ? query.slice(1) : query;

  return cleanQuery.split("&").reduce((params, param) => {
    const [key, value] = param.split("=");
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : "";
    }
    return params;
  }, {});
};

/**
 * Build query string from object
 * @param {Object} params - Parameters object
 * @returns {string} - Query string
 */
const buildQueryString = (params) => {
  const query = Object.keys(params)
    .filter(
      (key) =>
        params[key] !== undefined && params[key] !== null && params[key] !== ""
    )
    .map(
      (key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
    )
    .join("&");

  return query ? `?${query}` : "";
};

/**
 * Mask sensitive data
 * @param {Object} data - Data to mask
 * @param {Object} options - Masking options
 * @returns {Object} - Masked data
 */
const maskData = (data, options = {}) => {
  const {
    fields = [
      "password",
      "token",
      "secret",
      "authorization",
      "apiKey",
      "apiSecret",
    ],
    maskChar = "*",
    visibleChars = 4,
    preserveLength = true,
  } = options;

  const masked = { ...data };

  fields.forEach((field) => {
    if (masked[field] && typeof masked[field] === "string") {
      const value = masked[field];

      if (preserveLength) {
        const visible = value.slice(-visibleChars);
        const maskedPart = maskChar.repeat(
          Math.max(0, value.length - visibleChars)
        );
        masked[field] = maskedPart + visible;
      } else {
        masked[field] = maskChar.repeat(visibleChars);
      }
    }
  });

  return masked;
};

/**
 * Truncate string
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @param {string} suffix - Suffix to add
 * @returns {string} - Truncated string
 */
const truncate = (str, length = 100, suffix = "...") => {
  if (!str || str.length <= length) return str;
  return str.substring(0, length - suffix.length) + suffix;
};

/**
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} - Capitalized string
 */
const capitalize = (str) => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Capitalize each word
 * @param {string} str - String to capitalize
 * @returns {string} - Capitalized string
 */
const capitalizeWords = (str) => {
  if (!str) return str;
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Title case (each word capitalized, except articles, conjunctions, prepositions)
 * @param {string} str - String to convert
 * @returns {string} - Title cased string
 */
const titleCase = (str) => {
  if (!str) return str;

  const smallWords = [
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "for",
    "nor",
    "on",
    "at",
    "to",
    "by",
    "in",
    "of",
  ];

  return str
    .split(" ")
    .map((word, index) => {
      if (
        index === 0 ||
        index === str.split(" ").length - 1 ||
        !smallWords.includes(word.toLowerCase())
      ) {
        return capitalize(word);
      }
      return word.toLowerCase();
    })
    .join(" ");
};

/**
 * Slugify string
 * @param {string} str - String to slugify
 * @returns {string} - Slug
 */
const slugify = (str) => {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .trim();
};

/**
 * Camel case to snake case
 * @param {string} str - Camel case string
 * @returns {string} - Snake case string
 */
const camelToSnake = (str) => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

/**
 * Snake case to camel case
 * @param {string} str - Snake case string
 * @returns {string} - Camel case string
 */
const snakeToCamel = (str) => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Convert object keys to camel case
 * @param {Object} obj - Object to convert
 * @returns {Object} - Object with camel case keys
 */
const toCamelCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item));
  }

  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = snakeToCamel(key);
      result[camelKey] = toCamelCase(obj[key]);
      return result;
    }, {});
  }

  return obj;
};

/**
 * Convert object keys to snake case
 * @param {Object} obj - Object to convert
 * @returns {Object} - Object with snake case keys
 */
const toSnakeCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item));
  }

  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = camelToSnake(key);
      result[snakeKey] = toSnakeCase(obj[key]);
      return result;
    }, {});
  }

  return obj;
};

/**
 * Compare two objects deeply
 * @param {Object} obj1 - First object
 * @param {Object} obj2 - Second object
 * @returns {boolean} - True if equal
 */
const deepEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;

  if (
    typeof obj1 !== "object" ||
    typeof obj2 !== "object" ||
    obj1 === null ||
    obj2 === null
  ) {
    return false;
  }

  if (obj1 instanceof Date && obj2 instanceof Date) {
    return obj1.getTime() === obj2.getTime();
  }

  if (obj1 instanceof RegExp && obj2 instanceof RegExp) {
    return obj1.toString() === obj2.toString();
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
};

/**
 * Get difference between two objects
 * @param {Object} obj1 - Original object
 * @param {Object} obj2 - New object
 * @returns {Object} - Difference object
 */
const objectDiff = (obj1, obj2) => {
  const diff = {};

  // Check for changed or added properties
  for (const key in obj2) {
    if (!deepEqual(obj1[key], obj2[key])) {
      diff[key] = {
        old: obj1[key],
        new: obj2[key],
      };
    }
  }

  // Check for removed properties
  for (const key in obj1) {
    if (!(key in obj2)) {
      diff[key] = {
        old: obj1[key],
        new: undefined,
      };
    }
  }

  return diff;
};

/**
 * Get changes between two objects (simplified)
 * @param {Object} obj1 - Original object
 * @param {Object} obj2 - New object
 * @returns {Object} - Changes object
 */
const getChanges = (obj1, obj2) => {
  const changes = {};

  for (const key in obj2) {
    if (!deepEqual(obj1[key], obj2[key])) {
      changes[key] = obj2[key];
    }
  }

  return changes;
};

/**
 * Parse JSON safely
 * @param {string} str - JSON string
 * @param {any} defaultValue - Default value if parsing fails
 * @returns {any} - Parsed object or default value
 */
const safeJsonParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
};

/**
 * Stringify JSON safely
 * @param {any} obj - Object to stringify
 * @param {any} defaultValue - Default value if stringify fails
 * @returns {string} - JSON string or default value
 */
const safeJsonStringify = (obj, defaultValue = null) => {
  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
};

/**
 * Get nested object property safely
 * @param {Object} obj - Object to get from
 * @param {string} path - Path to property (dot notation)
 * @param {any} defaultValue - Default value if not found
 * @returns {any} - Property value or default
 */
const getNestedValue = (obj, path, defaultValue = undefined) => {
  if (!obj || !path) return defaultValue;

  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return defaultValue;
    }
    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
};

/**
 * Set nested object property safely
 * @param {Object} obj - Object to set on
 * @param {string} path - Path to property (dot notation)
 * @param {any} value - Value to set
 * @returns {Object} - Modified object
 */
const setNestedValue = (obj, path, value) => {
  if (!obj || !path) return obj;

  const keys = path.split(".");
  const lastKey = keys.pop();
  let current = obj;

  for (const key of keys) {
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  current[lastKey] = value;
  return obj;
};

/**
 * Create a memoized selector
 * @param {Function} selector - Selector function
 * @returns {Function} - Memoized selector
 */
const createSelector = (selector) => {
  let lastArgs = null;
  let lastResult = null;

  return (...args) => {
    if (lastArgs && deepEqual(lastArgs, args)) {
      return lastResult;
    }
    lastArgs = args;
    lastResult = selector(...args);
    return lastResult;
  };
};

/**
 * Compose functions
 * @param {...Function} fns - Functions to compose
 * @returns {Function} - Composed function
 */
const compose = (...fns) => {
  return (x) => fns.reduceRight((acc, fn) => fn(acc), x);
};

/**
 * Pipe functions
 * @param {...Function} fns - Functions to pipe
 * @returns {Function} - Piped function
 */
const pipe = (...fns) => {
  return (x) => fns.reduce((acc, fn) => fn(acc), x);
};

/**
 * Curry function
 * @param {Function} fn - Function to curry
 * @param {number} arity - Function arity
 * @returns {Function} - Curried function
 */
const curry = (fn, arity = fn.length) => {
  return function curried(...args) {
    if (args.length >= arity) {
      return fn(...args);
    }
    return (...moreArgs) => curried(...args, ...moreArgs);
  };
};

/**
 * Once function (executes only once)
 * @param {Function} fn - Function to execute once
 * @returns {Function} - Function that executes only once
 */
const once = (fn) => {
  let called = false;
  let result;

  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
};

/**
 * Measure execution time
 * @param {Function} fn - Function to measure
 * @returns {Promise<{result: any, time: number}>} - Result and execution time
 */
const measureTime = async (fn) => {
  const start = process.hrtime();
  const result = await fn();
  const [seconds, nanoseconds] = process.hrtime(start);
  const time = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds

  return { result, time };
};

/**
 * Log execution time
 * @param {Function} fn - Function to measure and log
 * @param {string} name - Function name for logging
 * @returns {Function} - Wrapped function
 */
const logTime = (fn, name = fn.name) => {
  return async (...args) => {
    const start = Date.now();
    const result = await fn(...args);
    const time = Date.now() - start;
    console.log(`${name} executed in ${time}ms`);
    return result;
  };
};

/**
 * Try catch wrapper
 * @param {Function} fn - Function to wrap
 * @returns {Function} - Wrapped function
 */
const tryCatch = (fn) => {
  return async (...args) => {
    try {
      const result = await fn(...args);
      return [null, result];
    } catch (error) {
      return [error, null];
    }
  };
};

/**
 * Create a deferred promise
 * @returns {Object} - Deferred object with promise, resolve, reject
 */
const createDeferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

/**
 * Wait for condition
 * @param {Function} condition - Condition function
 * @param {Object} options - Options
 * @returns {Promise} - Promise that resolves when condition is true
 */
const waitFor = (condition, options = {}) => {
  const {
    timeout = 30000,
    interval = 100,
    message = "Timeout waiting for condition",
  } = options;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime >= timeout) {
        reject(new Error(message));
      } else {
        setTimeout(check, interval);
      }
    };

    check();
  });
};

/**
 * Generate pagination metadata
 * @param {number} total - Total items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination metadata
 */
const getPaginationMeta = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };
};

/**
 * Parse pagination parameters
 * @param {Object} query - Query object
 * @param {Object} defaults - Default values
 * @returns {Object} - Parsed pagination
 */
const parsePagination = (query, defaults = {}) => {
  const { defaultPage = 1, defaultLimit = 20, maxLimit = 100 } = defaults;

  const page = parseInt(query.page) || defaultPage;
  const limit = Math.min(parseInt(query.limit) || defaultLimit, maxLimit);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

/**
 * Parse sort parameters
 * @param {Object} query - Query object
 * @param {Array} allowedFields - Allowed sort fields
 * @param {Object} defaults - Default values
 * @returns {Object} - Parsed sort
 */
const parseSort = (query, allowedFields = [], defaults = {}) => {
  const { defaultField = "created_at", defaultOrder = "DESC" } = defaults;

  let field = query.sort_by || defaultField;
  let order = (query.sort_order || defaultOrder).toUpperCase();

  // Validate field
  if (allowedFields.length > 0 && !allowedFields.includes(field)) {
    field = defaultField;
  }

  // Validate order
  if (!["ASC", "DESC"].includes(order)) {
    order = defaultOrder;
  }

  return { field, order };
};

/**
 * Parse filter parameters
 * @param {Object} query - Query object
 * @param {Array} allowedFilters - Allowed filter fields
 * @returns {Object} - Parsed filters
 */
const parseFilters = (query, allowedFilters = []) => {
  const filters = {};

  allowedFilters.forEach((filter) => {
    const value = query[filter];
    if (value !== undefined && value !== null && value !== "") {
      filters[filter] = value;
    }
  });

  return filters;
};

/**
 * Build WHERE clause from filters
 * @param {Object} filters - Filter object
 * @param {string} tableAlias - Table alias
 * @returns {Object} - WHERE clause and parameters
 */
const buildWhereClause = (filters, tableAlias = "") => {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      // IN clause
      const placeholders = value.map(() => `$${paramIndex++}`).join(", ");
      conditions.push(`${tableAlias}${key} IN (${placeholders})`);
      params.push(...value);
    } else if (typeof value === "object" && value !== null) {
      // Range or operator filters
      if (value.min !== undefined) {
        conditions.push(`${tableAlias}${key} >= $${paramIndex++}`);
        params.push(value.min);
      }
      if (value.max !== undefined) {
        conditions.push(`${tableAlias}${key} <= $${paramIndex++}`);
        params.push(value.max);
      }
      if (value.like !== undefined) {
        conditions.push(`${tableAlias}${key} ILIKE $${paramIndex++}`);
        params.push(`%${value.like}%`);
      }
    } else {
      // Equality
      conditions.push(`${tableAlias}${key} = $${paramIndex++}`);
      params.push(value);
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return { whereClause, params };
};

/**
 * Build ORDER BY clause
 * @param {string} field - Sort field
 * @param {string} order - Sort order
 * @param {string} tableAlias - Table alias
 * @returns {string} - ORDER BY clause
 */
const buildOrderClause = (field, order, tableAlias = "") => {
  return `ORDER BY ${tableAlias}${field} ${order}`;
};

/**
 * Build LIMIT and OFFSET clause
 * @param {number} limit - Limit
 * @param {number} offset - Offset
 * @returns {string} - LIMIT and OFFSET clause
 */
const buildLimitOffsetClause = (limit, offset) => {
  return `LIMIT ${limit} OFFSET ${offset}`;
};

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
const escapeHtml = (str) => {
  if (!str) return str;

  const htmlEscapes = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
};

/**
 * Unescape HTML special characters
 * @param {string} str - String to unescape
 * @returns {string} - Unescaped string
 */
const unescapeHtml = (str) => {
  if (!str) return str;

  const htmlUnescapes = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };

  return str.replace(
    /&(?:amp|lt|gt|quot|#39);/g,
    (char) => htmlUnescapes[char]
  );
};

/**
 * Strip HTML tags
 * @param {string} str - String to strip
 * @returns {string} - String without HTML tags
 */
const stripHtmlTags = (str) => {
  if (!str) return str;
  return str.replace(/<[^>]*>/g, "");
};

/**
 * Truncate HTML while preserving tags
 * @param {string} html - HTML string
 * @param {number} limit - Character limit
 * @param {string} suffix - Suffix to add
 * @returns {string} - Truncated HTML
 */
const truncateHtml = (html, limit = 100, suffix = "...") => {
  if (!html) return html;

  let charCount = 0;
  let tagStack = [];
  let result = "";
  let inTag = false;

  for (let i = 0; i < html.length; i++) {
    const char = html[i];

    if (char === "<") {
      inTag = true;
      result += char;
    } else if (char === ">") {
      inTag = false;
      result += char;

      // Track open/close tags
      const tag = result
        .substring(result.lastIndexOf("<") + 1, result.lastIndexOf(">"))
        .split(" ")[0];
      if (!tag.startsWith("/")) {
        tagStack.push(tag);
      } else if (
        tagStack.length > 0 &&
        tagStack[tagStack.length - 1] === tag.substring(1)
      ) {
        tagStack.pop();
      }
    } else if (inTag) {
      result += char;
    } else {
      charCount++;
      result += char;

      if (charCount >= limit) {
        // Close any open tags
        while (tagStack.length > 0) {
          result += `</${tagStack.pop()}>`;
        }
        result += suffix;
        break;
      }
    }
  }

  return result;
};

/**
 * Generate CSV from array of objects
 * @param {Array} data - Array of objects
 * @param {Array} columns - Column definitions
 * @returns {string} - CSV string
 */
const generateCsv = (data, columns = null) => {
  if (!data || data.length === 0) return "";

  const headers = columns || Object.keys(data[0]);
  const rows = [headers];

  data.forEach((item) => {
    const row = headers.map((header) => {
      const value = item[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value).replace(/,/g, "\\,");
    });
    rows.push(row);
  });

  return rows.map((row) => row.join(",")).join("\n");
};

/**
 * Parse CSV string to array
 * @param {string} csv - CSV string
 * @param {boolean} hasHeader - Whether CSV has header row
 * @returns {Array} - Parsed data
 */
const parseCsv = (csv, hasHeader = true) => {
  const lines = csv.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = hasHeader ? lines[0].split(",").map((h) => h.trim()) : null;
  const data = [];

  const startRow = hasHeader ? 1 : 0;
  for (let i = startRow; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());

    if (hasHeader) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      data.push(row);
    } else {
      data.push(values);
    }
  }

  return data;
};

/**
 * Convert object to FormData
 * @param {Object} obj - Object to convert
 * @returns {FormData} - FormData object
 */
const objectToFormData = (obj) => {
  const formData = new FormData();

  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });

  return formData;
};

/**
 * Convert FormData to object
 * @param {FormData} formData - FormData object
 * @returns {Object} - Object
 */
const formDataToObject = (formData) => {
  const obj = {};

  for (const [key, value] of formData.entries()) {
    obj[key] = value;
  }

  return obj;
};

module.exports = {
  isEmpty,
  isNotEmpty,
  deepClone,
  deepMerge,
  isObject,
  isPlainObject,
  pick,
  omit,
  groupBy,
  groupByMultiple,
  chunkArray,
  uniqueArray,
  uniqueByKey,
  sortByKey,
  sortByMultipleKeys,
  filterObject,
  objectToArray,
  arrayToObject,
  flattenObject,
  unflattenObject,
  randomString,
  randomNumber,
  generateUUID,
  calculatePercentage,
  calculateAverage,
  calculateWeightedAverage,
  calculateMedian,
  calculateMode,
  calculateStdDev,
  calculateVariance,
  calculateCorrelation,
  sleep,
  retry,
  debounce,
  throttle,
  memoize,
  parseQueryString,
  buildQueryString,
  maskData,
  truncate,
  capitalize,
  capitalizeWords,
  titleCase,
  slugify,
  camelToSnake,
  snakeToCamel,
  toCamelCase,
  toSnakeCase,
  deepEqual,
  objectDiff,
  getChanges,
  safeJsonParse,
  safeJsonStringify,
  getNestedValue,
  setNestedValue,
  createSelector,
  compose,
  pipe,
  curry,
  once,
  measureTime,
  logTime,
  tryCatch,
  createDeferred,
  waitFor,
  getPaginationMeta,
  parsePagination,
  parseSort,
  parseFilters,
  buildWhereClause,
  buildOrderClause,
  buildLimitOffsetClause,
  escapeHtml,
  unescapeHtml,
  stripHtmlTags,
  truncateHtml,
  generateCsv,
  parseCsv,
  objectToFormData,
  formDataToObject,
};
