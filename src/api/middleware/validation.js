const { BadRequestError } = require("./error-handling");

/**
 * Input validation middleware
 *
 * Features:
 * - JSON schema-like validation
 * - Type checking
 * - Range validation
 * - Sanitization
 * - Performance-optimized (no external dependencies)
 */

/**
 * Validate request body against schema
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      const errors = validateObject(req.body, schema, "body");

      if (errors.length > 0) {
        throw new BadRequestError("Validation failed", { errors });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Validate query parameters against schema
 */
function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const errors = validateObject(req.query, schema, "query");

      if (errors.length > 0) {
        throw new BadRequestError("Validation failed", { errors });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Validate object against schema
 */
function validateObject(obj, schema, path = "") {
  const errors = [];

  // Check required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (obj[field] === undefined || obj[field] === null) {
        errors.push({
          field: `${path}.${field}`,
          message: `Field is required`,
          code: "required",
        });
      }
    }
  }

  // Check properties
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      const value = obj[field];

      // Skip if optional and not present
      if (value === undefined || value === null) {
        if (!schema.required || !schema.required.includes(field)) {
          continue;
        }
      }

      // Validate field
      const fieldErrors = validateField(value, fieldSchema, `${path}.${field}`);
      errors.push(...fieldErrors);
    }
  }

  return errors;
}

/**
 * Validate individual field
 */
function validateField(value, schema, path) {
  const errors = [];

  // Type validation
  if (schema.type) {
    const actualType = Array.isArray(value) ? "array" : typeof value;

    if (actualType !== schema.type) {
      errors.push({
        field: path,
        message: `Expected type ${schema.type}, got ${actualType}`,
        code: "invalid_type",
      });
      return errors; // Stop further validation if type is wrong
    }
  }

  // String validations
  if (schema.type === "string") {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push({
        field: path,
        message: `String length must be at least ${schema.minLength}`,
        code: "min_length",
      });
    }

    if (schema.maxLength && value.length > schema.maxLength) {
      errors.push({
        field: path,
        message: `String length must be at most ${schema.maxLength}`,
        code: "max_length",
      });
    }

    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          field: path,
          message: `String does not match pattern ${schema.pattern}`,
          code: "pattern_mismatch",
        });
      }
    }

    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        field: path,
        message: `Value must be one of: ${schema.enum.join(", ")}`,
        code: "invalid_enum",
      });
    }
  }

  // Number validations
  if (schema.type === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        field: path,
        message: `Value must be at least ${schema.minimum}`,
        code: "minimum",
      });
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        field: path,
        message: `Value must be at most ${schema.maximum}`,
        code: "maximum",
      });
    }
  }

  // Array validations
  if (schema.type === "array") {
    if (schema.minItems && value.length < schema.minItems) {
      errors.push({
        field: path,
        message: `Array must have at least ${schema.minItems} items`,
        code: "min_items",
      });
    }

    if (schema.maxItems && value.length > schema.maxItems) {
      errors.push({
        field: path,
        message: `Array must have at most ${schema.maxItems} items`,
        code: "max_items",
      });
    }

    // Validate array items
    if (schema.items) {
      value.forEach((item, index) => {
        const itemErrors = validateField(item, schema.items, `${path}[${index}]`);
        errors.push(...itemErrors);
      });
    }
  }

  // Object validations
  if (schema.type === "object" && schema.properties) {
    const objectErrors = validateObject(value, schema, path);
    errors.push(...objectErrors);
  }

  return errors;
}

/**
 * Common validation schemas
 */
const commonSchemas = {
  // Messages endpoint
  messagesRequest: {
    type: "object",
    required: ["model", "messages"],
    properties: {
      model: {
        type: "string",
        minLength: 1,
        maxLength: 200,
      },
      messages: {
        type: "array",
        minItems: 1,
        maxItems: 1000,
        items: {
          type: "object",
          required: ["role", "content"],
          properties: {
            role: {
              type: "string",
              enum: ["user", "assistant", "system"],
            },
            content: {
              type: "string",
              minLength: 1,
            },
          },
        },
      },
      max_tokens: {
        type: "number",
        minimum: 1,
        maximum: 100000,
      },
      temperature: {
        type: "number",
        minimum: 0,
        maximum: 2,
      },
      stream: {
        type: "boolean",
      },
    },
  },
};

module.exports = {
  validateBody,
  validateQuery,
  validateObject,
  validateField,
  commonSchemas,
};
