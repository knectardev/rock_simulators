import { MineralType } from './MineralType.js';

export class MineralTypeRegistry {
  constructor(mineralTypes) {
    this.types = mineralTypes;
  }

  static createDefault() {
    const quartz = new MineralType({
      id: 'quartz',
      label: 'Quartz',
      defaultColor: '#60a5fa',
      baselineRadiusRange: [6, 14],
    });
    const feldspar = new MineralType({
      id: 'feldspar',
      label: 'Feldspar',
      defaultColor: '#f59e0b',
      baselineRadiusRange: [8, 18],
    });
    const mica = new MineralType({
      id: 'mica',
      label: 'Mica',
      defaultColor: '#34d399',
      baselineRadiusRange: [10, 22],
    });
    return new MineralTypeRegistry([quartz, feldspar, mica]);
  }

  getAll() {
    return this.types.slice();
  }

  getById(id) {
    return this.types.find((t) => t.id === id) || null;
  }

  pickRandom() {
    const i = Math.floor(Math.random() * this.types.length);
    return this.types[i];
  }
}


