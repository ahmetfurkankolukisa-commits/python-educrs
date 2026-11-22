/**
 * Compile-time extension registry (plan §2.3). Plugins live in the repo and are
 * registered at build time; nothing is ever loaded from outside at runtime.
 */
export class Registry<T> {
  readonly #items = new Map<string, T>();
  #frozen = false;

  constructor(readonly kind: string) {}

  register(key: string, item: T): this {
    if (this.#frozen) throw new Error(`${this.kind} registry is frozen; cannot add ${key}`);
    if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error(`${this.kind}: invalid key ${JSON.stringify(key)}`);
    if (this.#items.has(key)) throw new Error(`${this.kind}: duplicate key ${key}`);
    this.#items.set(key, item);
    return this;
  }

  get(key: string): T {
    const item = this.#items.get(key);
    if (item === undefined) throw new Error(`${this.kind}: unknown key ${key}`);
    return item;
  }

  has(key: string): boolean {
    return this.#items.has(key);
  }

  keys(): string[] {
    return [...this.#items.keys()].sort();
  }

  /** Call once app wiring is complete so late registration is a loud bug. */
  freeze(): this {
    this.#frozen = true;
    return this;
  }
}
