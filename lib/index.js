import { fileURLToPath } from "node:url";
import { createReadStream, promises } from "node:fs";
import * as path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
// node_modules/@deepseek-ai/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Shared config references used by schema validators and plugin runtimes. */
const write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
	if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
	if (value === null || typeof value !== "object") return value;
	if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
	ancestors.add(value);
	try {
		if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
		if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
		return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
	} finally {
		ancestors.delete(value);
	}
}
/**
* Create a detached reference containing an immutable copy of the supplied data.
* @param value - validated config data; class instances and functions are unsupported.
* @returns a reference whose value is updated only by its owning runtime.
*/
function createVolatile(value) {
	let current = snapshot(value);
	return Object.freeze({
		get: () => current,
		[write]: (value) => {
			current = value;
		}
	});
}
/**
* Identify references across ESM/CJS copies of the shared library.
* @param value - a parsed config value.
* @returns whether the value implements the shared reference protocol.
*/
function isVolatile(value) {
	return typeof value === "object" && value !== null && write in value;
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary) {
	Binary.is = isArrayBufferLike;
	Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/**
* Compare values recursively, treating two volatile references as equal regardless of value.
* Strict comparison distinguishes null/undefined, treats opaque objects by identity,
* compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
* @param a - first value.
* @param b - second value.
* @param strict - whether to require strict data equality outside volatile references.
* @returns whether the values compare equal.
*/
function deepEqual(a, b, strict) {
	const ancestors = /* @__PURE__ */ new Set();
	function compare(a, b) {
		if (a === b) return true;
		if (isVolatile(a) || isVolatile(b)) return isVolatile(a) && isVolatile(b);
		if (!strict && isNullable(a) && isNullable(b)) return true;
		if (typeof a !== typeof b || typeof a !== "object" || !a || !b) return false;
		if (ancestors.has(a)) return false;
		function check(test, then) {
			return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
		}
		ancestors.add(a);
		try {
			return check(Array.isArray, (a, b) => {
				if (a.length !== b.length) return false;
				for (let index = 0; index < a.length; index++) if (!compare(a[index], b[index])) return false;
				return true;
			}) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("URL"), (a, b) => a.href === b.href) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
				if (a.byteLength !== b.byteLength) return false;
				const viewA = new Uint8Array(a);
				const viewB = new Uint8Array(b);
				for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
				return true;
			}) ?? ((!strict || [a, b].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
				...a,
				...b
			}).every((key) => compare(a[key], b[key])));
		} finally {
			ancestors.delete(a);
		}
	}
	return compare(a, b);
}
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time) {
	Time.millisecond = 1;
	Time.second = 1e3;
	Time.minute = Time.second * 60;
	Time.hour = Time.minute * 60;
	Time.day = Time.hour * 24;
	Time.week = Time.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
	}
	Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time.minute);
	}
	Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
	}
	Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
		else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
		else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
		else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
		return ms + "ms";
	}
	Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time.template = template;
})(Time || (Time = {}));
// node_modules/@deepseek-ai/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (isVolatile(value)) value = value.get();
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.volatile = function volatile() {
	if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
	return this.extra("volatile", true);
};
const resolvers = {};
const checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
	const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
	if (states.has(blocked)) return;
	states.add(blocked);
	seen.set(schema, states);
	if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
	const nested = blocked || !!schema.meta?.volatile;
	if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
	if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
	if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
	if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (!options[checkedVolatile]) {
		validateVolatileSchema(schema, options.path);
		options = {
			...options,
			[checkedVolatile]: true
		};
	}
	if (schema.meta?.volatile) {
		const inner = Schema(schema);
		inner.meta = {
			...schema.meta,
			volatile: false
		};
		const [value, adapted] = Schema.resolve(data, inner, options, strict);
		try {
			return [createVolatile(value), adapted];
		} catch (error) {
			throw new ValidationError(error instanceof Error ? error.message : String(error), options);
		}
	}
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
		validateVolatileSchema(schema.inner, options.path, true);
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
// src/shared/contract.ts
/**
* Shape shared by the host half and the browser half: route names, tab
* identities, file-address parsing, and the extension classification that
* decides which viewer a tab gets.
*
* This module must stay dependency-free (no `node:` imports) because the client
* bundle includes it verbatim.
*
* @module dsh-plugin-documd/shared/contract
*/
/** Plugin id: package name, cordis row id, and locale namespace. */
const PLUGIN_ID = "dsh-plugin-documd";
/** Route prefix registered on `ctx.webServer` by the host half. */
const ROUTE_PREFIX = "/docu-preview";
/** Static viewer root: `GET /docu-preview/viewer/index.html`. */
const VIEWER_PREFIX = `${ROUTE_PREFIX}/viewer`;
/**
* Cache-busting segment for the viewer bundle.
*
* Must equal `package.json`'s version (a unit test pins it): the client loads
* `/docu-preview/viewer/<ASSET_VERSION>/index.html`, and that subtree is served
* with `immutable` cache headers, so a version bump is what invalidates the
* 3.7 MB `viewer.js` instead of a revalidation on every tab open.
*/
const ASSET_VERSION = "1.0.0";
/** JSON/binary API root. */
const API_PREFIX = `${ROUTE_PREFIX}/api`;
/**
* How the plugin participates in dsh's tab competition.
*
* - `manual` (default): never claims an address at tab level. The viewer is
*   only reachable through dsh's own `打开方式` list, so the built-in preview
*   stays in charge.
* - `auto`: additionally registers tab kinds for the extensions it can render;
*   `priority` decides who wins against dsh's own definitions.
* - `off`: registers nothing at all.
*/
const PREVIEW_MODES = [
	"manual",
	"auto",
	"off"
];
const DEFAULT_PREVIEW_MODE = "manual";
/** dsh tab bands, highest first: `extension` > `builtin` > `fallback`. */
const PRIORITY_BANDS = [
	"extension",
	"builtin",
	"fallback"
];
const DEFAULT_PRIORITY = "builtin";
/** Markdown files the docu.md engine renders as documents. */
const MARKDOWN_EXTENSIONS = [".md", ".markdown"];
/**
* Source files rendered through the viewer's code surface. Mirrors
* `EXT_LANG_MAP` in the vendored engine (`src/utils/extension-categories.ts`);
* keep the two lists in sync when upgrading the vendor tree.
*/
const CODE_EXTENSIONS = [
	".js",
	".mjs",
	".cjs",
	".jsx",
	".ts",
	".mts",
	".cts",
	".tsx",
	".d.ts",
	".vue",
	".svelte",
	".py",
	".rb",
	".go",
	".rs",
	".java",
	".kt",
	".swift",
	".dart",
	".c",
	".cpp",
	".cc",
	".cxx",
	".h",
	".hpp",
	".hh",
	".hxx",
	".cs",
	".php",
	".lua",
	".r",
	".scala",
	".zig",
	".pl",
	".perl",
	".erl",
	".hrl",
	".escript",
	".html",
	".htm",
	".css",
	".scss",
	".sass",
	".less",
	".json",
	".jsonc",
	".json5",
	".yaml",
	".yml",
	".toml",
	".ini",
	".env",
	".properties",
	".xml",
	".xsl",
	".xslt",
	".sh",
	".bash",
	".zsh",
	".fish",
	".ps1",
	".bat",
	".cmd",
	".mdx",
	".txt",
	".log",
	".tex",
	".bib",
	".csv",
	".tsv",
	".sql"
];
/** Diagram files the viewer wraps into the matching render type. */
const DIAGRAM_EXTENSIONS = [
	".mermaid",
	".mmd",
	".plantuml",
	".puml",
	".vega",
	".vl",
	".vega-lite",
	".gv",
	".dot",
	".infographic",
	".canvas",
	".drawio",
	".echarts"
];
/** PDF and raster/vector images shown with the browser's own renderer. */
const NATIVE_EXTENSIONS = [
	".pdf",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".avif",
	".bmp",
	".ico",
	".svg"
];
const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
function isDriveSegment(segment) {
	return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
}
/**
* Read a file address back into its parts without resolving `.` or `..`.
* Mirrors the official `parseFileAddress` so both plugins agree on identity.
* @param address - a candidate address.
* @returns the parts, or `undefined` when the string is not a file address.
*/
function parseFileAddress(address) {
	try {
		if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
		const queryOrHash = address.slice(20).search(/[?#]/);
		const [scope, ...rest] = address.slice(20, queryOrHash === -1 ? void 0 : 20 + queryOrHash).split("/");
		if (scope === "session") {
			const [id, ...segments] = rest;
			if (!id || segments.length === 0) return void 0;
			return {
				scope,
				sessionId: decodeURIComponent(id),
				path: segments.map(decodeURIComponent).join("/")
			};
		}
		if (scope === "absolute") {
			const unc = rest[0] === "" && rest.length > 1;
			const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
			if (segments.length === 0 || segments[0] === "") return void 0;
			const joined = segments.join("/");
			if (unc) return {
				scope,
				path: `//${joined}`
			};
			return {
				scope,
				path: isDriveSegment(segments[0]) ? joined : `/${joined}`
			};
		}
		return;
	} catch {
		return;
	}
}
function matches(path, extensions) {
	const ordered = [...extensions].sort((a, b) => b.length - a.length);
	const lower = path.toLowerCase();
	return ordered.some((ext) => lower.endsWith(ext));
}
/**
* Decide which tab kind a path belongs to.
* @param path - workspace-relative or absolute path.
* @returns the category, defaulting to `unsupported` so nothing fails silently.
*/
function classifyPath(path) {
	if (matches(path, MARKDOWN_EXTENSIONS) || matches(path, CODE_EXTENSIONS) || matches(path, DIAGRAM_EXTENSIONS)) return "viewer";
	if (matches(path, NATIVE_EXTENSIONS)) return "native";
	return "unsupported";
}
/** @returns whether the string is a supported preview mode. */
function isPreviewMode(value) {
	return typeof value === "string" && PREVIEW_MODES.includes(value);
}
/** @returns whether the string is a dsh priority band. */
function isPriorityBand(value) {
	return typeof value === "string" && PRIORITY_BANDS.includes(value);
}
/** Theme ids from the vendored `src/themes/registry.json` used for dsh light/dark. */
const THEME_LIGHT = "vscode";
const THEME_DARK = "vscode-dark";
/**
* Resolve the viewer theme id from the plugin setting and the host's appearance.
* @param preference - `auto`, or an explicit theme id.
* @param dark - whether dsh is currently rendering its dark palette.
* @returns a theme id understood by the vendored theme registry.
*/
function resolveThemeId(preference, dark) {
	if (preference && preference !== "auto") return preference;
	return dark ? THEME_DARK : THEME_LIGHT;
}
// src/host/paths.ts
/**
* Workspace containment for every file the viewer reads.
*
* Two rules, both enforced on the real path rather than the requested string:
*   - the resolved file must exist and be a regular file;
*   - its realpath must sit inside one of the roots that apply to the request.
*
* Roots are **per address scope**, mirroring dsh itself
* (`@deepseek-ai/dsh-api-workspace-files`): a `session` address names a live
* session whose workspace is `session.header.cwd`, falling back to
* `sandboxPolicy.workspaceRoot`; an `absolute` address uses the deployment
* default. Relative paths are joined to those roots, absolute ones are used
* verbatim.
*
* Comparison normalizes both sides (`path.resolve`, which is case-insensitive
* for drive letters on Windows) and additionally compares against the
* `realpath` of every root, so a workspace reached through a symlink still
* contains its files. When `realpath` fails but `stat` succeeds, the normalized
* path is used instead of guessing.
*
* @module dsh-plugin-documd/host/paths
*/
/** Raised when a request names something outside the allowed roots. */
var OutsideWorkspaceError = class extends Error {
	code = "outside_workspace";
};
/** Raised when the path does not exist, is a directory, or cannot be stat'ed. */
var MissingFileError = class extends Error {
	code = "missing_file";
};
/**
* Is `target` at or below `root` after normalizing both?
* @param root - absolute root.
* @param target - absolute path.
* @returns whether the target is contained.
*/
function isContained(root, target) {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	return relative === "" || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
/** Split a `;`/`,` separated root list. */
function splitRoots(raw) {
	return raw.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean);
}
/**
* Resolve file requests against the roots that apply to their address scope.
*
* `workspaceRoot` in the config is an optional extra root list (`;`/`,`
* separated); an empty value means "use what dsh reports", which is the
* session cwd for session addresses and `sandboxPolicy.workspaceRoot` /
* `process.cwd()` otherwise.
*/
var WorkspacePaths = class {
	/** Raw configured value, re-read on each resolve so settings edits apply live. */
	readRootConfig;
	/** Host-provided roots, keyed by the session an address names. */
	rootsForSession;
	constructor(readRootConfig, rootsForSession) {
		this.readRootConfig = readRootConfig;
		this.rootsForSession = rootsForSession;
	}
	/**
	* The roots in force for one address scope, absolute and normalized.
	* @param sessionId - the session named by the address, if any.
	* @returns every applicable root, in priority order (session first).
	*/
	roots(sessionId) {
		const provided = this.rootsForSession?.(sessionId) ?? [];
		const configured = splitRoots(this.readRootConfig());
		const combined = [...provided, ...configured];
		if (combined.length === 0) combined.push(process.cwd());
		return [...new Set(combined.map((entry) => path.resolve(entry)))];
	}
	/**
	* Resolve one requested path.
	* @param requested - workspace-relative (session scope) or absolute (absolute scope).
	* @param sessionId - the session named by a session-scoped address.
	* @param trace - optional array that receives the candidate attempts.
	* @returns the contained file.
	* @throws OutsideWorkspaceError when the resolved path escapes every root.
	* @throws MissingFileError when the target is absent or not a regular file.
	*/
	async resolve(requested, sessionId, trace) {
		const cleaned = requested.replace(/\\/g, "/");
		if (!cleaned || cleaned.includes("\0")) throw new MissingFileError("empty path");
		const roots = this.roots(sessionId);
		const candidates = path.isAbsolute(cleaned) ? [path.resolve(cleaned)] : roots.map((root) => path.resolve(root, cleaned));
		const rootVariants = [];
		for (const root of roots) {
			rootVariants.push(path.resolve(root));
			try {
				rootVariants.push(path.resolve(await promises.realpath(root)));
			} catch {}
		}
		for (const candidate of candidates) {
			let effective;
			let fallback = false;
			try {
				effective = await promises.realpath(candidate);
			} catch {
				effective = path.resolve(candidate);
				fallback = true;
			}
			let stat;
			try {
				stat = await promises.stat(effective);
			} catch {
				trace?.push({
					candidate,
					fallback,
					stat: "error"
				});
				continue;
			}
			if (!stat.isFile()) {
				trace?.push({
					candidate,
					realPath: effective,
					fallback,
					stat: "other"
				});
				continue;
			}
			const contained = rootVariants.some((root) => isContained(root, effective));
			trace?.push({
				candidate,
				realPath: effective,
				fallback,
				stat: "file",
				contained
			});
			if (!contained) throw new OutsideWorkspaceError("path escapes the workspace root");
			return {
				realPath: effective,
				displayPath: cleaned,
				size: stat.size,
				mtimeMs: stat.mtimeMs
			};
		}
		throw new MissingFileError("no such file in the workspace");
	}
};
const MIME_BY_EXTENSION = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
	".pdf": "application/pdf",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".eot": "application/vnd.ms-fontobject",
	".wasm": "application/wasm",
	".txt": "text/plain; charset=utf-8",
	".map": "application/json; charset=utf-8"
};
/**
* Content type for a static asset path.
* @param filePath - any path with an extension.
* @returns a MIME type, defaulting to `application/octet-stream`.
*/
function mimeFor(filePath) {
	return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
/**
* Split a `Range: bytes=…` header into a concrete window.
* @param header - the raw header value.
* @param size - full body length.
* @returns inclusive start/end offsets, or `undefined` when the header is absent or unusable.
*/
function parseRange(header, size) {
	if (!header) return void 0;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return void 0;
	const [, rawStart, rawEnd] = match;
	if (rawStart === "" && rawEnd === "") return void 0;
	let start;
	let end;
	if (rawStart === "") {
		const suffix = Number(rawEnd);
		if (!Number.isFinite(suffix) || suffix <= 0) return void 0;
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(rawStart);
		end = rawEnd === "" ? size - 1 : Number(rawEnd);
	}
	if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return void 0;
	return {
		start,
		end: Math.min(end, size - 1)
	};
}
// src/host/tokens.ts
/**
* Per-tab capability tokens.
*
* A tab asks the host for a token once; the viewer iframe then carries it in its
* URL and uses it for every file/asset request. Tokens are random, bound to one
* document path, expire after `tokenTtlMs`, and are revoked when the tab closes
* or the plugin unloads — the viewer never holds a session credential.
*
* @module dsh-plugin-documd/host/tokens
*/
/**
* Validate a token string without leaking comparison timing.
* @param left - candidate token.
* @param right - issued token.
* @returns whether both are the same string.
*/
function sameToken(left, right) {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}
/** In-memory token table owned by one plugin instance. */
var TokenStore = class {
	records = /* @__PURE__ */ new Map();
	/**
	* Issue a token for one document.
	* @param path - path the viewer may read.
	* @param filename - basename shown in the UI.
	* @param ttlMs - lifetime in milliseconds.
	* @param sessionId - session whose workspace scopes later reads.
	* @returns the record, including the token string.
	*/
	issue(path, filename, ttlMs, sessionId) {
		const token = randomBytes(24).toString("hex");
		const record = {
			token,
			path,
			sessionId,
			filename,
			expiresAt: Date.now() + Math.max(1e3, ttlMs)
		};
		this.records.set(token, record);
		this.prune();
		return record;
	}
	/**
	* Look a token up.
	* @param token - candidate token.
	* @returns the record, or `undefined` when absent or expired.
	*/
	get(token) {
		if (!token) return void 0;
		const record = this.records.get(token);
		if (!record) return void 0;
		if (record.expiresAt <= Date.now()) {
			this.records.delete(token);
			return;
		}
		return record;
	}
	/**
	* Revoke one token.
	* @param token - candidate token.
	* @returns whether a live record was removed.
	*/
	revoke(token) {
		if (!token) return false;
		const record = this.records.get(token);
		if (!record || !sameToken(record.token, token)) return false;
		this.records.delete(token);
		return true;
	}
	/** Drop expired records; called on every issue so the table cannot grow unbounded. */
	prune() {
		const now = Date.now();
		for (const [token, record] of this.records) if (record.expiresAt <= now) this.records.delete(token);
	}
	/** Revoke everything (plugin unload). */
	clear() {
		this.records.clear();
	}
};
// src/host/routes.ts
/**
* The plugin's HTTP surface, mounted on `ctx.webServer` at `/docu-preview`.
*
* | route | purpose |
* | --- | --- |
* | `GET /docu-preview/viewer/*` | the static docu.md viewer bundle |
* | `POST /docu-preview/api/session` | issue a per-tab token for one file address |
* | `DELETE /docu-preview/api/session` | revoke a token when the tab closes |
* | `GET /docu-preview/api/theme` | resolve the viewer theme id for light/dark |
* | `GET /docu-preview/api/file` | document text (JSON) |
* | `GET /docu-preview/api/asset` | binary asset by absolute/relative path |
* | `GET /docu-preview/api/asset/<token>/<dir>/<name>` | relative image/asset rewrite target |
* | `GET /docu-preview/api/options` | preview mode/priority the client half registers with |
* | `GET /docu-preview/api/diagnostics` | the raw resolve chain (only when `debug: true`) |
*
* Everything is same-origin: the browser half and the viewer iframe both live on
* the dsh web origin, so no CORS headers are emitted and cross-site POSTs are
* rejected by the Origin check below.
*
* @module dsh-plugin-documd/host/routes
*/
function sendJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(payload);
}
function sendError(res, status, error, message) {
	sendJson(res, status, {
		error,
		message
	});
}
/**
* Reject cross-site state changes.
*
* A browser always sends `Origin` on POST/DELETE from another origin; same-origin
* requests may omit it. Requests without `Origin` are therefore only the local
* CLI/curl path, which cannot be reached cross-origin by a web page.
*/
function sameOrigin(req) {
	const origin = req.headers.origin;
	if (!origin) return true;
	const host = req.headers.host;
	if (!host) return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}
/** Read a small JSON body; refuses anything larger than 64 KiB. */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		total += buffer.length;
		if (total > 65536) throw new Error("request body too large");
		chunks.push(buffer);
	}
	if (total === 0) return {};
	const raw = Buffer.concat(chunks).toString("utf8");
	const parsed = JSON.parse(raw);
	return parsed && typeof parsed === "object" ? parsed : {};
}
function joinUrlPath(...segments) {
	return segments.flatMap((segment) => segment.split("/")).filter(Boolean).join("/");
}
/**
* Build the request handler and the token table it uses.
* @param options - live settings and the viewer root.
* @returns the handler plus the store so the plugin can clear it on unload.
*/
function createRoutes(options) {
	const tokens = new TokenStore();
	const paths = new WorkspacePaths(options.workspaceRoot, options.rootForSession);
	/**
	* Ring buffer of the client/viewer timing reports (`POST /api/metrics`).
	*
	* Surfaced through `/api/diagnostics` while `debug: true` so a slow tab can
	* be reported with numbers instead of "feels slow".
	*/
	const metrics = [];
	const METRICS_KEEP = 8;
	async function serveViewerAsset(relative, req, res) {
		let requested = relative || "index.html";
		if (requested.includes("\0")) return sendError(res, 400, "bad_path", "invalid asset path");
		let versioned = false;
		const versionMatch = /^([^/]+)\/(.*)$/.exec(requested);
		if (versionMatch && /^\d+\.\d+\.\d+/.test(versionMatch[1] ?? "")) {
			if (versionMatch[1] !== "1.0.0") return sendError(res, 404, "stale_asset", `viewer ${versionMatch[1]} is not this build`);
			versioned = true;
			requested = versionMatch[2] || "index.html";
		}
		const normalized = path.posix.normalize(requested.replace(/\\/g, "/"));
		if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) return sendError(res, 403, "outside_viewer", "asset path escapes the viewer root");
		const root = path.resolve(options.viewerRoot);
		const target = path.resolve(root, normalized);
		const relativeToRoot = path.relative(root, target);
		if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return sendError(res, 403, "outside_viewer", "asset path escapes the viewer root");
		let stat;
		try {
			stat = await promises.stat(target);
		} catch {
			return sendError(res, 404, "not_found", "asset not found");
		}
		if (!stat.isFile()) return sendError(res, 404, "not_found", "asset not found");
		const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
		const cacheControl = versioned ? "public, max-age=31536000, immutable" : normalized === "index.html" ? "no-cache" : "public, max-age=300";
		if (req.headers["if-none-match"] === etag) {
			res.writeHead(304, {
				etag,
				"cache-control": cacheControl,
				"x-content-type-options": "nosniff"
			});
			res.end();
			return;
		}
		res.writeHead(200, {
			"content-type": mimeFor(target),
			"content-length": stat.size,
			etag,
			"cache-control": cacheControl,
			"x-content-type-options": "nosniff"
		});
		createReadStream(target).pipe(res);
	}
	async function handleSession(req, res) {
		if (req.method === "DELETE") {
			const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("token") ?? "";
			tokens.revoke(token);
			return sendJson(res, 200, { revoked: true });
		}
		if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", "use POST or DELETE");
		if (!sameOrigin(req)) return sendError(res, 403, "cross_origin", "cross-origin token requests are refused");
		const body = await readJsonBody(req);
		const address = typeof body.address === "string" ? body.address : "";
		const dark = body.dark === true;
		if (!address) return sendError(res, 400, "bad_address", "address is required");
		const parsed = parseFileAddress(address);
		if (!parsed) return sendError(res, 400, "bad_address", "not a dsh-resource://file/ address");
		const sessionId = parsed.scope === "session" ? parsed.sessionId : void 0;
		const trace = [];
		let resolved;
		try {
			resolved = await paths.resolve(parsed.path, sessionId, trace);
		} catch (error) {
			return sendPathError(res, error, {
				address,
				sessionId,
				trace
			});
		}
		if (options.debug()) options.log(JSON.stringify({
			event: "resolve",
			address,
			scope: parsed.scope,
			sessionId,
			path: parsed.path,
			roots: paths.roots(sessionId),
			trace,
			realPath: resolved.realPath
		}));
		const limit = Math.max(1, options.maxPreviewBytes());
		if (resolved.size > limit) return sendError(res, 413, "preview_limit", `file is ${resolved.size} bytes, above the ${limit}-byte preview limit`);
		const filename = path.posix.basename(parsed.path.replace(/\\/g, "/"));
		const record = tokens.issue(resolved.displayPath, filename, options.tokenTtlMs(), sessionId);
		sendJson(res, 200, {
			token: record.token,
			path: resolved.displayPath,
			filename,
			size: resolved.size,
			category: classifyPath(parsed.path),
			themeId: resolveThemeId(options.themeId(), dark),
			expiresAt: record.expiresAt
		});
	}
	async function handleFile(url, res) {
		const record = tokens.get(url.searchParams.get("token") ?? "");
		if (!record) return sendError(res, 401, "bad_token", "missing or expired preview token");
		const requested = url.searchParams.get("path") || record.path;
		const binary = url.searchParams.get("binary") === "1";
		const trace = [];
		let resolved;
		try {
			resolved = await paths.resolve(requested, record.sessionId, trace);
		} catch (error) {
			return sendPathError(res, error, {
				address: record.path,
				sessionId: record.sessionId,
				trace
			});
		}
		const limit = Math.max(1, options.maxPreviewBytes());
		if (resolved.size > limit) return sendError(res, 413, "preview_limit", `file is ${resolved.size} bytes, above the ${limit}-byte preview limit`);
		const raw = await promises.readFile(resolved.realPath);
		sendJson(res, 200, {
			content: binary ? raw.toString("base64") : raw.toString("utf8"),
			encoding: binary ? "base64" : "utf8",
			path: resolved.displayPath,
			filename: path.posix.basename(resolved.displayPath.replace(/\\/g, "/")),
			size: resolved.size,
			mtimeMs: resolved.mtimeMs,
			truncated: false
		});
	}
	async function handleAsset(req, url, res) {
		const queryToken = url.searchParams.get("token") ?? "";
		const pathTail = url.pathname.slice(`${API_PREFIX}/asset`.length);
		let segments;
		try {
			segments = pathTail.split("/").filter(Boolean).map(decodeURIComponent);
		} catch {
			return sendError(res, 400, "bad_path", "asset path is not validly encoded");
		}
		let token = queryToken;
		let requested = url.searchParams.get("path") ?? "";
		if (segments.length >= 2) {
			token = segments[0] ?? "";
			const dir = segments[1] ?? "";
			const rest = segments.slice(2).join("/");
			if (dir.startsWith("/") || /^[A-Za-z]:/.test(dir)) requested = rest ? `${dir.replace(/\/+$/, "")}/${rest}` : dir;
			else requested = joinUrlPath(dir, rest);
		}
		const record = tokens.get(token);
		if (!record) return sendError(res, 401, "bad_token", "missing or expired preview token");
		if (!requested) return sendError(res, 400, "bad_path", "asset path is required");
		const trace = [];
		let resolved;
		try {
			resolved = await paths.resolve(requested, record.sessionId, trace);
		} catch (error) {
			return sendPathError(res, error, {
				address: record.path,
				sessionId: record.sessionId,
				trace
			});
		}
		const range = parseRange(req.headers.range, resolved.size);
		const headers = {
			"content-type": mimeFor(resolved.realPath),
			"accept-ranges": "bytes",
			"cache-control": "private, max-age=60",
			"x-content-type-options": "nosniff"
		};
		if (range) {
			res.writeHead(206, {
				...headers,
				"content-range": `bytes ${range.start}-${range.end}/${resolved.size}`,
				"content-length": range.end - range.start + 1
			});
			createReadStream(resolved.realPath, {
				start: range.start,
				end: range.end
			}).pipe(res);
			return;
		}
		res.writeHead(200, {
			...headers,
			"content-length": resolved.size
		});
		createReadStream(resolved.realPath).pipe(res);
	}
	function sendPathError(res, error, context) {
		if (context && options.debug()) options.log(JSON.stringify({
			event: "resolve_failed",
			address: context.address,
			sessionId: context.sessionId,
			roots: paths.roots(context.sessionId),
			trace: context.trace,
			error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
		}));
		if (error instanceof OutsideWorkspaceError) {
			sendError(res, 403, "outside_workspace", error.message);
			return;
		}
		if (error instanceof MissingFileError) {
			sendError(res, 404, "not_found", error.message);
			return;
		}
		options.log(`[dsh-plugin-documd] unexpected path error: ${String(error)}`);
		sendError(res, 500, "internal", "could not resolve the requested path");
	}
	function handleOptions(res) {
		sendJson(res, 200, {
			mode: options.mode(),
			priority: options.priority(),
			rememberChoice: options.rememberChoice(),
			assetVersion: ASSET_VERSION
		});
	}
	/**
	* Expose the whole resolve chain.
	*
	* This is the "print the real inputs" surface for bug reports: raw address,
	* parsed path, session, roots, per-candidate realpath/stat/containment. It
	* only exists while `debug: true`, so a production install does not leak
	* filesystem layout.
	*/
	async function handleDiagnostics(url, res) {
		if (!options.debug()) return sendError(res, 404, "not_found", "diagnostics are disabled (set debug: true)");
		const address = url.searchParams.get("address") ?? "";
		const parsed = address ? parseFileAddress(address) : void 0;
		const requested = parsed?.path ?? url.searchParams.get("path") ?? "";
		const sessionId = parsed?.scope === "session" ? parsed.sessionId : url.searchParams.get("session") ?? void 0;
		if (!requested) return sendError(res, 400, "bad_path", "address or path is required");
		const trace = [];
		let outcome = "missing";
		let realPath;
		try {
			const resolved = await paths.resolve(requested, sessionId, trace);
			outcome = "resolved";
			realPath = resolved.realPath;
		} catch (error) {
			outcome = error instanceof OutsideWorkspaceError ? "outside" : "missing";
		}
		sendJson(res, 200, {
			outcome,
			address: address || void 0,
			scope: parsed?.scope,
			sessionId,
			requested,
			roots: paths.roots(sessionId),
			trace,
			realPath,
			assetVersion: ASSET_VERSION,
			metrics
		});
	}
	/** `POST /api/metrics` — open-per-tab timings, kept in memory while debugging. */
	async function handleMetrics(req, res) {
		if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", "use POST");
		if (!sameOrigin(req)) return sendError(res, 403, "bad_origin", "metrics must come from the app origin");
		let body;
		try {
			body = await readJsonBody(req);
		} catch {
			return sendError(res, 400, "bad_json", "metrics body must be JSON");
		}
		if (!body || typeof body !== "object") return sendError(res, 400, "bad_json", "metrics body must be a JSON object");
		metrics.push({
			receivedAt: Date.now(),
			...body
		});
		while (metrics.length > METRICS_KEEP) metrics.shift();
		sendJson(res, 200, {
			ok: true,
			kept: metrics.length,
			debug: options.debug()
		});
	}
	async function handle(req, res) {
		const rawUrl = req.url ?? "/";
		const parsed = new URL(rawUrl, `http://${req.headers.host ?? "127.0.0.1"}`);
		const pathname = parsed.pathname;
		if (pathname.startsWith(`/docu-preview/viewer/`)) return serveViewerAsset(pathname.slice(`${VIEWER_PREFIX}/`.length), req, res);
		if (pathname === "/docu-preview/viewer") return serveViewerAsset("index.html", req, res);
		if (pathname === `/docu-preview/api/session`) return handleSession(req, res);
		if (pathname === `/docu-preview/api/metrics`) return handleMetrics(req, res);
		if (pathname === `/docu-preview/api/options`) {
			if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "use GET");
			return handleOptions(res);
		}
		if (pathname === `/docu-preview/api/diagnostics`) {
			if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "use GET");
			return handleDiagnostics(parsed, res);
		}
		if (pathname === `/docu-preview/api/theme`) {
			if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "use GET");
			const dark = parsed.searchParams.get("dark") === "1";
			return sendJson(res, 200, { themeId: resolveThemeId(options.themeId(), dark) });
		}
		if (pathname === `/docu-preview/api/file`) {
			if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "use GET");
			return handleFile(parsed, res);
		}
		if (pathname === `/docu-preview/api/asset` || pathname.startsWith(`/docu-preview/api/asset/`)) {
			if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "use GET");
			return handleAsset(req, parsed, res);
		}
		sendError(res, 404, "not_found", "unknown docu-preview route");
	}
	return {
		handle,
		tokens,
		paths
	};
}
// src/index.ts
/**
* 宿主半边：把 `/docu-preview` 挂到 dsh 的 HTTP 服务上（静态 viewer + 文件/资产 API）。
*
* 服务名提醒：`@deepseek-ai/dsh-host-webserver` 在 0.0.1-rc.1 里注册为
* `httpServer`，从 0.1.x 起注册为 `webServer`。本插件按 0.2.1-rc.5（当前锁定的
* dsh 运行时）的 `webServer` 注入；若 profile 里装的是 0.0.x 的 dsh，请把 inject 改成
* `httpServer`（README 的「兼容性」一节有说明）。
*
* 浏览器半边在 src/client/，注册三种右侧栏 tab 类型（viewer / native / unsupported）。
*
* @module dsh-plugin-documd
*/
/** 宿主插件名，须与 package.json 的 name 及 cordis.patch.yml 的 id 一致。 */
const name = PLUGIN_ID;
/** 依赖的服务：webServer 就绪后本插件才会加载。 */
const inject = ["webServer"];
/**
* Schemastery schema：默认值写在这里，cordis.yml 与 GUI 改写都会经过它校验。
* 不写 `Schema<Config>` 注解——`.volatile()` 的输出类型是解包后的值。
*/
const Config = Schema.object({
	workspaceRoot: Schema.string().default("").volatile(),
	themeId: Schema.string().default("auto").volatile(),
	maxPreviewBytes: Schema.number().default(8388608).volatile(),
	tokenTtlMs: Schema.number().default(6e5).volatile(),
	mode: Schema.union([...PREVIEW_MODES]).default(DEFAULT_PREVIEW_MODE).volatile(),
	priority: Schema.union([...PRIORITY_BANDS]).default(DEFAULT_PRIORITY).volatile(),
	rememberChoice: Schema.boolean().default(true).volatile(),
	debug: Schema.boolean().default(false).volatile()
});
/** `assets/viewer` 与 lib/index.js 同属包根，装进 profile 后路径不变。 */
const VIEWER_ROOT = fileURLToPath(new URL("../assets/viewer", import.meta.url));
/**
* The workspace roots dsh itself would use for an address.
*
* Mirrors `@deepseek-ai/dsh-api-workspace-files`: a session address is scoped by
* `session.header.cwd` (falling back to the sandbox-policy default), and
* everything else uses the deployment default. Services are looked up lazily,
* so this also works in profiles that do not mount session storage.
*
* @param ctx - host context.
* @returns a resolver for `WorkspacePaths`.
*/
function createRootResolver(ctx) {
	return (sessionId) => {
		if (sessionId) {
			const cwd = ctx.reflect.get("sessions", false)?.get(sessionId)?.header?.cwd;
			if (cwd) return [cwd];
		}
		const sandbox = ctx.reflect.get("sandboxPolicy", false);
		return sandbox?.workspaceRoot ? [sandbox.workspaceRoot] : [];
	};
}
/**
* 插件主体：注册路由，插件停用时撤销路由并吊销所有令牌。
* @param ctx - 宿主插件上下文。
* @param config - 经过校验的配置，各字段是 Volatile 引用。
*/
function apply(ctx, config) {
	ctx.effect(() => {
		const routes = createRoutes({
			viewerRoot: VIEWER_ROOT,
			workspaceRoot: () => config.workspaceRoot.get(),
			rootForSession: createRootResolver(ctx),
			maxPreviewBytes: () => config.maxPreviewBytes.get(),
			tokenTtlMs: () => config.tokenTtlMs.get(),
			themeId: () => config.themeId.get(),
			mode: () => {
				const value = config.mode.get();
				return isPreviewMode(value) ? value : DEFAULT_PREVIEW_MODE;
			},
			priority: () => {
				const value = config.priority.get();
				return isPriorityBand(value) ? value : DEFAULT_PRIORITY;
			},
			rememberChoice: () => config.rememberChoice.get() !== false,
			debug: () => config.debug.get() === true,
			log: (message) => console.debug(message)
		});
		const dispose = ctx.webServer.register({
			kind: "prefix",
			path: ROUTE_PREFIX,
			handler: routes.handle
		});
		return () => {
			dispose();
			routes.tokens.clear();
		};
	}, "dsh-plugin-documd: routes");
}
export { Config, apply, inject, name };
