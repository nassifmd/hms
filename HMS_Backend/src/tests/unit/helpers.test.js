const {
  isEmpty,
  isNotEmpty,
  deepClone,
  deepMerge,
  pick,
  omit,
  groupBy,
  chunkArray,
  uniqueArray,
  uniqueByKey,
  sortByKey,
  calculatePercentage,
  calculateAverage,
  calculateMedian,
  calculateMode,
  parseQueryString,
  buildQueryString,
  capitalize,
  slugify,
  camelToSnake,
  snakeToCamel,
  escapeHtml,
  unescapeHtml,
  stripHtmlTags,
  deepEqual,
  getNestedValue,
  setNestedValue,
  parsePagination,
  getPaginationMeta,
  safeJsonParse,
  sleep,
} = require("../../utils/helpers");

describe("isEmpty / isNotEmpty", () => {
  it("isEmpty returns true for null/undefined", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it("isEmpty returns true for empty string", () => {
    expect(isEmpty("")).toBe(true);
    expect(isEmpty("   ")).toBe(true);
  });

  it("isEmpty returns true for empty array/object", () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
  });

  it("isEmpty returns false for non-empty values", () => {
    expect(isEmpty("hello")).toBe(false);
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });

  it("isNotEmpty inverts isEmpty", () => {
    expect(isNotEmpty("hello")).toBe(true);
    expect(isNotEmpty(null)).toBe(false);
  });
});

describe("deepClone", () => {
  it("clones a plain object", () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    expect(cloned.b).not.toBe(obj.b);
  });

  it("clones arrays", () => {
    const arr = [1, [2, 3]];
    const cloned = deepClone(arr);
    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
    expect(cloned[1]).not.toBe(arr[1]);
  });

  it("clones Date objects", () => {
    const date = new Date();
    const cloned = deepClone(date);
    expect(cloned).toEqual(date);
    expect(cloned).not.toBe(date);
    expect(cloned.getTime()).toBe(date.getTime());
  });

  it("returns primitives as-is", () => {
    expect(deepClone(null)).toBe(null);
    expect(deepClone(42)).toBe(42);
    expect(deepClone("str")).toBe("str");
  });
});

describe("deepMerge", () => {
  it("merges two objects deeply", () => {
    const target = { a: 1, b: { c: 2 } };
    const source = { b: { d: 3 }, e: 4 };
    const merged = deepMerge(target, source);
    expect(merged).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
  });

  it("does not modify the original target", () => {
    const target = { a: 1 };
    const source = { b: 2 };
    const merged = deepMerge(target, source);
    expect(target).toEqual({ a: 1 });
    expect(merged).toEqual({ a: 1, b: 2 });
  });
});

describe("pick", () => {
  it("picks specified keys from object", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("ignores non-existent keys", () => {
    expect(pick({ a: 1 }, ["a", "b"])).toEqual({ a: 1 });
  });
});

describe("omit", () => {
  it("omits specified keys from object", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ["a", "c"])).toEqual({ b: 2 });
  });
});

describe("groupBy", () => {
  it("groups array of objects by key", () => {
    const data = [
      { type: "A", val: 1 },
      { type: "B", val: 2 },
      { type: "A", val: 3 },
    ];
    const grouped = groupBy(data, "type");
    expect(grouped).toEqual({
      A: [{ type: "A", val: 1 }, { type: "A", val: 3 }],
      B: [{ type: "B", val: 2 }],
    });
  });
});

describe("chunkArray", () => {
  it("splits array into chunks of given size", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns empty array for invalid input", () => {
    expect(chunkArray(null, 2)).toEqual([]);
    expect(chunkArray([1], 0)).toEqual([]);
  });
});

describe("uniqueArray", () => {
  it("removes duplicates", () => {
    expect(uniqueArray([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });
});

describe("uniqueByKey", () => {
  it("removes duplicates by key", () => {
    const data = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 1, name: "C" },
    ];
    expect(uniqueByKey(data, "id")).toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
  });
});

describe("sortByKey", () => {
  it("sorts ascending by default", () => {
    const data = [{ n: 3 }, { n: 1 }, { n: 2 }];
    expect(sortByKey(data, "n")).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it("sorts descending when specified", () => {
    const data = [{ n: 1 }, { n: 3 }, { n: 2 }];
    expect(sortByKey(data, "n", "desc")).toEqual([{ n: 3 }, { n: 2 }, { n: 1 }]);
  });
});

describe("calculatePercentage", () => {
  it("returns correct percentage", () => {
    expect(calculatePercentage(25, 100)).toBe(25);
  });

  it("returns 0 when total is 0", () => {
    expect(calculatePercentage(50, 0)).toBe(0);
  });
});

describe("calculateAverage", () => {
  it("returns average of numbers", () => {
    expect(calculateAverage([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns 0 for empty array", () => {
    expect(calculateAverage([])).toBe(0);
  });
});

describe("calculateMedian", () => {
  it("returns median for odd-length array", () => {
    expect(calculateMedian([1, 3, 5])).toBe(3);
  });

  it("returns median for even-length array", () => {
    expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns 0 for empty array (not NaN)", () => {
    const result = calculateMedian([]);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe("calculateMode", () => {
  it("returns most frequent value", () => {
    expect(calculateMode([1, 1, 2, 3])).toEqual([1]);
  });

  it("returns multiple modes when tied", () => {
    expect(calculateMode([1, 1, 2, 2, 3]).sort()).toEqual([1, 2]);
  });

  it("returns empty array for empty input", () => {
    expect(calculateMode([])).toEqual([]);
  });
});

describe("parseQueryString / buildQueryString", () => {
  it("parseQueryString parses query to object", () => {
    expect(parseQueryString("?a=1&b=hello")).toEqual({ a: "1", b: "hello" });
  });

  it("parseQueryString handles missing '?'", () => {
    expect(parseQueryString("a=1&b=2")).toEqual({ a: "1", b: "2" });
  });

  it("parseQueryString returns empty object for empty input", () => {
    expect(parseQueryString("")).toEqual({});
    expect(parseQueryString(null)).toEqual({});
  });

  it("buildQueryString builds from object", () => {
    expect(buildQueryString({ a: 1, b: "hello" })).toBe("?a=1&b=hello");
  });

  it("buildQueryString skips null/undefined/empty", () => {
    expect(buildQueryString({ a: 1, b: null, c: undefined, d: "" })).toBe("?a=1");
  });
});

describe("capitalize", () => {
  it("capitalizes first letter and lowercases rest", () => {
    expect(capitalize("hello")).toBe("Hello");
    expect(capitalize("HELLO")).toBe("Hello");
  });

  it("returns falsy values as-is", () => {
    expect(capitalize("")).toBe("");
    expect(capitalize(null)).toBe(null);
  });
});

describe("slugify", () => {
  it("converts to lowercase hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("preserves leading/trailing hyphens from spaces", () => {
    // trim() doesn't remove hyphens, only whitespace
    expect(slugify("  Extra  Spaces  ")).toBe("-extra-spaces-");
  });

  it("removes special characters", () => {
    expect(slugify("Hello! World?")).toBe("hello-world");
  });
});

describe("camelToSnake / snakeToCamel", () => {
  it("camelToSnake converts camelCase", () => {
    expect(camelToSnake("helloWorld")).toBe("hello_world");
  });

  it("camelToSnake: each uppercase gets prefixed", () => {
    expect(camelToSnake("userID")).toBe("user_i_d");
  });

  it("snakeToCamel converts snake_case", () => {
    expect(snakeToCamel("hello_world")).toBe("helloWorld");
  });
});

describe("escapeHtml / unescapeHtml / stripHtmlTags", () => {
  it("escapeHtml escapes special chars", () => {
    expect(escapeHtml('<script>"x"</script>')).toBe(
      "&lt;script&gt;&quot;x&quot;&lt;/script&gt;"
    );
  });

  it("unescapeHtml reverses escape", () => {
    expect(unescapeHtml("&lt;div&gt;")).toBe("<div>");
  });

  it("stripHtmlTags removes HTML tags", () => {
    expect(stripHtmlTags("<p>Hello <b>World</b></p>")).toBe("Hello World");
  });

  it("returns falsy values as-is", () => {
    expect(escapeHtml("")).toBe("");
    expect(unescapeHtml(null)).toBe(null);
    expect(stripHtmlTags(undefined)).toBe(undefined);
  });
});

describe("deepEqual", () => {
  it("returns true for equal objects", () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
  });

  it("returns false for unequal objects", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("handles primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
  });

  it("handles Date objects", () => {
    const d1 = new Date("2024-01-01");
    const d2 = new Date("2024-01-01");
    expect(deepEqual(d1, d2)).toBe(true);
  });
});

describe("getNestedValue / setNestedValue", () => {
  it("getNestedValue retrieves nested property", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, "a.b.c")).toBe(42);
  });

  it("getNestedValue returns default for missing path", () => {
    expect(getNestedValue({}, "a.b", "default")).toBe("default");
    expect(getNestedValue(null, "a.b", "default")).toBe("default");
  });

  it("setNestedValue sets nested property", () => {
    const obj = {};
    setNestedValue(obj, "a.b.c", 42);
    expect(obj.a.b.c).toBe(42);
  });

  it("setNestedValue returns obj unmodified for invalid inputs", () => {
    expect(setNestedValue(null, "a.b", 42)).toBe(null);
    expect(setNestedValue({}, "", 42)).toEqual({});
  });
});

describe("parsePagination", () => {
  it("uses defaults when no query provided", () => {
    const result = parsePagination({});
    expect(result).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it("parses page and limit from query", () => {
    const result = parsePagination({ page: "3", limit: "10" });
    expect(result).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it("caps limit to maxLimit", () => {
    const result = parsePagination({ page: "1", limit: "200" }, { maxLimit: 100 });
    expect(result.limit).toBe(100);
  });
});

describe("getPaginationMeta", () => {
  it("returns metadata for given total, page, limit", () => {
    const meta = getPaginationMeta(50, 2, 10);
    expect(meta).toEqual({
      page: 2,
      limit: 10,
      total: 50,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
      nextPage: 3,
      prevPage: 1,
    });
  });

  it("handles first page", () => {
    const meta = getPaginationMeta(50, 1, 10);
    expect(meta.hasPrev).toBe(false);
    expect(meta.prevPage).toBe(null);
  });

  it("handles last page", () => {
    const meta = getPaginationMeta(50, 5, 10);
    expect(meta.hasNext).toBe(false);
    expect(meta.nextPage).toBe(null);
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns default for invalid JSON", () => {
    expect(safeJsonParse("{bad}", null)).toBe(null);
  });
});

describe("sleep", () => {
  it("resolves after given ms", async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
