/*  TSEPC
    Copyright (C) 2016  Phil Lehmkuhl

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';

import {Bus} from './bus';

export class Ram implements Bus {
  private memory: Uint8Array = null;
  
  constructor(size: number) {
    this.memory = new Uint8Array(size);
    this.memory.fill(0x0);
  }

  public readMemory(address: number): number {
    return this.memory[address];
  }
  
  readBlock(address: number, size: number): Uint8Array {
    return this.memory.slice(address, address + size);
  }

  public writeMemory(address: number, value: number) {
    this.memory[address] = value;
  }
  
  get buffer(): Uint8Array {
    return this.memory;
  }
}
