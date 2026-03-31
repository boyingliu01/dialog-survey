// Verification file to test TypeScript setup
export function add(a: number, b: number): number {
  return a + b;
}

export interface User {
  readonly id: string;
  name: string;
  email?: string;
}

export function greet(user: User): string {
  return `Hello, ${user.name}!`;
}
