/**
 * Sample test to demonstrate the new testing approach
 */

describe('Sample Test', () => {
  test('basic arithmetic operations', () => {
    // Addition
    expect(1 + 1).toBe(2);
    
    // Subtraction
    expect(5 - 3).toBe(2);
    
    // Multiplication
    expect(2 * 3).toBe(6);
    
    // Division
    expect(10 / 2).toBe(5);
  });
  
  test('string operations', () => {
    // Concatenation
    expect('hello ' + 'world').toBe('hello world');
    
    // Length
    expect('hello'.length).toBe(5);
    
    // Uppercase
    expect('hello'.toUpperCase()).toBe('HELLO');
    
    // Lowercase
    expect('WORLD'.toLowerCase()).toBe('world');
  });
  
  test('array operations', () => {
    const array = [1, 2, 3, 4, 5];
    
    // Length
    expect(array.length).toBe(5);
    
    // Includes
    expect(array.includes(3)).toBe(true);
    expect(array.includes(6)).toBe(false);
    
    // Map
    const doubled = array.map(x => x * 2);
    expect(doubled).toEqual([2, 4, 6, 8, 10]);
    
    // Filter
    const evens = array.filter(x => x % 2 === 0);
    expect(evens).toEqual([2, 4]);
  });
});