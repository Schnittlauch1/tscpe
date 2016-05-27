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

/*export interface Register
{
  uint: number;
  size: number;

  from(buff: Uint8Array);
  wideRead(): number;
}

class ByteRegister 
  implements Register {
  private data: Uint8Array;
  private wideData: Uint32Array;
  private offset: number;

  constructor(data: ArrayBuffer, offset: number) {
    this.data = new Uint8Array(data, offset, 1);
    this.wideData = new Uint16Array(data);
    this.offset = offset;
  }

  get uint(): number {
    return this.data[0];
  }

  set uint(val: number) {
    this.data[0] = val;
  }

  public wideRead(): number {
    return this.wideData[0];
  }

  get size(): number {
    return 1;
  }

  public from(buff: Uint8Array) {
    this.data[0] = buff[0];
  }
};*/

export class Register {
  private data: Uint16Array;
  private dataBytes: Uint8Array;
  private dataAccess: any;
  public lo: Register;
  public hi: Register;
  private bytes: number;

  constructor(parent: ArrayBuffer = null, offset: number = 0) {
    if(parent) {
      this.data = new Uint16Array(parent);
      this.dataBytes = new Uint8Array(parent, offset);
      this.lo = null;
      this.hi = null;
      this.bytes = 1;
      this.dataAccess = this.dataBytes;
    } else {
      this.data = new Uint16Array(1);
      this.dataBytes = new Uint8Array(this.data.buffer);
      this.lo = new Register(this.data.buffer, 0);
      this.hi = new Register(this.data.buffer, 1);
      this.bytes = 2;
      this.dataAccess = this.data;
    }
  }
  
  get uint(): number {
    return this.dataAccess[0];
  }

  set uint(val: number) {
    this.dataAccess[0] = val;
  }

  public wideRead(): number {
    return this.data[0];
  }

  public from(buff: Uint8Array) {
    for(let i=0; i < this.bytes; i++) {
      this.dataBytes[i] = buff[i];
    }
  }

  get size(): number {
    return this.bytes;
  }
}

export enum Z80Register {
  AF = 0xA000, WZ = 0xA001, BC = 0xA002, DE = 0xA003, HL = 0xA004, 
  AF_ = 0xA005, WZ_ = 0xA006, BC_ = 0xA007, DE_ = 0xA008, HL_ = 0xA009,
  IX = 0xA00A, IY = 0xA00B, SP = 0xA00C, PC = 0xA00D, I = 0xA00E, R = 0xA00F, MEMPTR = 0xA010,
  A = 0xA011, F = 0xA012, W = 0xA013, Z = 0xA0014, B = 0xA015, C = 0xA016, D = 0xA017, E = 0xA018, H = 0xA019, L = 0xA01A,
  IXH = 0xA01B, IXL = 0xA01C, IYH = 0xA01D, IYL = 0xA01E
};

export const RegisterNames: string[] 
                     = ['AF', 'WZ', 'BC', 'DE', 'HL', 
                        'AF_', 'WZ_', 'BC_', 'DE_', 'HL_', 
                        'IX', 'IY', 'SP', 'PC', 'I', 'R', 'MEMPTR',
                        'A', 'F', 'W', 'Z', 'B', 'C', 'D', 'E', 'H', 'L',
                        'IXH', 'IXL', 'IYH', 'IYL'];

export class Registers {
  public AF = new Register;
  public WZ = new Register;
  public BC = new Register;
  public DE = new Register;
  public HL = new Register;

  public AF_ = new Register;
  public WZ_ = new Register;
  public BC_ = new Register;
  public DE_ = new Register;
  public HL_ = new Register;

  public IX = new Register;
  public IY = new Register;
  public SP = new Register;
  public PC = new Register;

  public I = new Register(new Uint8Array(2).buffer, 0);
  public R = new Register(new Uint8Array(2).buffer, 0);

  public MEMPTR = new Register;
  
  public A = this.AF.hi;
  public F = this.AF.lo;
  
  public W = this.WZ.hi;
  public Z = this.WZ.lo;
  
  public B = this.BC.hi;
  public C = this.BC.lo;
  
  public D = this.DE.hi;
  public E = this.DE.lo;
  
  public H = this.HL.hi;
  public L = this.HL.lo;

  public IXH = this.IX.hi;
  public IXL = this.IX.lo;
  
  public IYH = this.IY.hi;
  public IYL = this.IY.lo;
}
