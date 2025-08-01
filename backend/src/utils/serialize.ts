/**
 * Serialization utilities for handling complex objects
 */

/**
 * Safe JSON stringify that handles circular references
 */
export function safeStringify(obj: any, space?: number): string {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    
    // Handle special types
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    if (value instanceof RegExp) {
      return value.toString();
    }
    
    if (typeof value === 'bigint') {
      return value.toString();
    }
    
    if (value === undefined) {
      return null;
    }
    
    return value;
  }, space);
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as any;
  }
  
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags) as any;
  }
  
  if (obj instanceof Map) {
    const cloned = new Map();
    obj.forEach((value, key) => {
      cloned.set(deepClone(key), deepClone(value));
    });
    return cloned as any;
  }
  
  if (obj instanceof Set) {
    const cloned = new Set();
    obj.forEach(value => {
      cloned.add(deepClone(value));
    });
    return cloned as any;
  }
  
  // Handle plain objects
  const cloned: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

/**
 * Serialize data for transmission or storage
 */
export function serialize(data: any): string {
  return safeStringify({
    timestamp: new Date().toISOString(),
    data: data,
  });
}

/**
 * Deserialize data with error handling
 */
export function deserialize<T>(serialized: string): T | null {
  try {
    const parsed = JSON.parse(serialized);
    return parsed.data as T;
  } catch (error) {
    console.error('Deserialization error:', error);
    return null;
  }
}

/**
 * Convert object to FormData for file uploads
 */
export function objectToFormData(obj: any, formData?: FormData, parentKey?: string): FormData {
  formData = formData || new FormData();
  
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const formKey = parentKey ? `${parentKey}[${key}]` : key;
    
    if (value === null || value === undefined) {
      return;
    }
    
    if (value instanceof File || value instanceof Blob) {
      formData.append(formKey, value);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const arrayKey = `${formKey}[${index}]`;
        if (typeof item === 'object' && !(item instanceof File) && !(item instanceof Blob)) {
          objectToFormData(item, formData, arrayKey);
        } else {
          formData.append(arrayKey, item);
        }
      });
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      objectToFormData(value, formData, formKey);
    } else {
      formData.append(formKey, value instanceof Date ? value.toISOString() : String(value));
    }
  });
  
  return formData;
}

/**
 * Flatten nested object structure
 */
export function flattenObject(obj: any, prefix = ''): Record<string, any> {
  return Object.keys(obj).reduce((acc: Record<string, any>, key: string) => {
    const pre = prefix.length ? `${prefix}.` : '';
    const value = obj[key];
    
    if (value === null || value === undefined) {
      acc[pre + key] = value;
    } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(acc, flattenObject(value, pre + key));
    } else {
      acc[pre + key] = value;
    }
    
    return acc;
  }, {});
}

/**
 * Unflatten object structure
 */
export function unflattenObject(obj: Record<string, any>): any {
  const result: any = {};
  
  for (const key in obj) {
    const keys = key.split('.');
    let current = result;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      current[k] = current[k] || {};
      current = current[k];
    }
    
    current[keys[keys.length - 1]] = obj[key];
  }
  
  return result;
} 