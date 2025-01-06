/**
 * Define utils to save/load canvas status with local storage
 */
export class SaveInBrowser {
  public static save(name: string, value: string | object) {
    // if item is an object, stringify
    if (value instanceof Object) {
      value = JSON.stringify(value);
    }

    localStorage.setItem(name, value);
  }
  public static load(name: string) {
    let value = localStorage.getItem(name) ?? '{}';
    value = JSON.parse(value);

    return value;
  }

  public static remove(name: string) {
    localStorage.removeItem(name);
  }
}
