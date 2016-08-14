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

import {Operation} from './z80-operations';
import {Operations} from './z80-operations';
import {operations} from './z80-operations';
import {Z80Cpu} from './z80';
import {Register} from './z80-register';
import {Z80Register} from './z80-register';
import {opcode} from './opcodes';
import {SpecialOp} from './opcodes';
import {OpFlags} from './opcodes';
import {FlagNames} from './opcodes';
import {RegisterNames} from './z80-register';

const CachedByteBuffer = new Uint8Array(1);
const CachedWordBuffer = new Uint16Array(1);
const CachedWordBufferBytes = new Uint8Array(CachedWordBuffer.buffer);

export type OperandType = string | Uint8Array | Uint16Array | number;
//export type Operand = OperandType | OperandType[];

export const enum OperandClass {
  Invalid,
  Register,
  Address,
  Immediate,
  Flag
}

export class Operand {
  private cpu: Z80Cpu;
  public name: string;
  public byteVal: Uint8Array;
  public wordVal: Uint16Array;
  public sbyteVal: Int8Array;
  public type: OperandClass;
  public size: number;
  public register: Register;
  
  constructor(cpu: Z80Cpu) {
    this.cpu = cpu;
    this.byteVal = new Uint8Array(2);
    this.sbyteVal = new Int8Array(this.byteVal.buffer);
    this.wordVal = new Uint16Array(this.byteVal.buffer);
    this.reset();
  }
  
  public reset() {
    this.name = null;
    this.type = OperandClass.Invalid;
    this.size = 0;
    this.register = null;
    this.byteVal[0] = 0;
    this.byteVal[1] = 0;
  }
  
  public address(): number {
    if(this.type !== OperandClass.Address) { return NaN; }
    if(this.register) {
      let adr = this.register.uint;
      adr += this.sbyteVal[0];
      
      return adr;
    } else {
      return this.wordVal[0];
    }
  }
  
  public read(): number {
    switch(this.type) {
      case OperandClass.Immediate:
        if(this.size == 2) {
          return this.wordVal[0];
        } else {
          return this.byteVal[0];
        }
        
      case OperandClass.Address:
        return this.cpu.bus().readMemory(this.address());
        
      case OperandClass.Register:
        return this.register.uint;
        
      default:
        return NaN;
    }
  }
  
  public write(val: number) {
    switch(this.type) {
      case OperandClass.Address:
        this.cpu.bus().writeMemory(this.address(), val & 0xFF);
        break;
        
      case OperandClass.Register:
        this.register.uint = val;
        break;
    }
  }
  
  public toString(): string {
    if(this.type == OperandClass.Address) {
      let str: string = '(';
      
      if(this.name !== null) {
        str += this.name;
        
        if(this.sbyteVal[0] !== 0) {
          str += ', ' + this.sbyteVal[0]; 
        }
      } else {
        str += this.wordVal[0].toString(16);
      }
      
      str += ')';
      return str;
    } else {
      if(this.type == OperandClass.Immediate) {
        if(this.size === 2) {
          return this.wordVal[0].toString(16);
        } else {
          return this.byteVal[0].toString(16);
        }
      } else {
        return this.name;
      }
    }
  }
}

export class Instruction {
  cpu: Z80Cpu = null;
  address: number = NaN;
  opcode: Operations = null;
  operation: Operation = null;
  operands: Operand[] = null;
  cbPrefix: boolean = false;
  size: number = NaN;
  
  constructor(cpu: Z80Cpu) {
    this.cpu = cpu;
    this.opArrayCache = [
      [],
      [new Operand(this.cpu)],
      [new Operand(this.cpu), new Operand(this.cpu)],
      [new Operand(this.cpu), new Operand(this.cpu), new Operand(this.cpu)]
    ];
  }
  
  private opArrayCache: (Operand[])[];

  private decodeAddressOperand(op: Operand, val: any[]) {
    for(let i=0; i < val.length; i++) {
      this.fetchOperand(op, val[i]);
    }
    
    op.type = OperandClass.Address;
  }
  
  private decodeOperand(op: Operand, val: number | number[]) {
    if(typeof(val) === 'object') {
      this.decodeAddressOperand(op, <number[]>val);
    } else {
      this.fetchOperand(op, <number>val);
      //this.decodeValueOperand(op, val);
    }
  }
  
  private setRegister(op: Operand, reg: number) {
    let register = null;
    
    op.name = RegisterNames[reg & 0xFF];
    
    switch(reg) {
      case Z80Register.AF:
        op.register = this.cpu.reg.AF;
        break;
        
      case Z80Register.AF_:
        op.register = this.cpu.reg.AF_;
        break;
        
      case Z80Register.WZ:
        op.register = this.cpu.reg.WZ;
        break;
        
      case Z80Register.BC:
        op.register = this.cpu.reg.BC;
        break;
        
      case Z80Register.DE:
        op.register = this.cpu.reg.DE;
        break;
        
      case Z80Register.IX:
        op.register = this.cpu.reg.IX;
        break;
        
      case Z80Register.HL:
        op.register = this.cpu.reg.HL;
        break;
        
      case Z80Register.IY:
        op.register = this.cpu.reg.IY;
        break;
        
      case Z80Register.SP:
        op.register = this.cpu.reg.SP;
        break;
        
      case Z80Register.PC:
        op.register = this.cpu.reg.PC;
        break;
        
      case Z80Register.I:
        op.register = this.cpu.reg.I;
        break;
        
      case Z80Register.R:
        op.register = this.cpu.reg.R;
        break;
        
      case Z80Register.A:
        op.register = this.cpu.reg.A;
        break;
        
      case Z80Register.F:
        op.register = this.cpu.reg.F;
        break;
        
      case Z80Register.B:
        op.register = this.cpu.reg.B;
        break;
        
      case Z80Register.C:
        op.register = this.cpu.reg.C;
        break;
        
      case Z80Register.D:
        op.register = this.cpu.reg.D;
        break;
        
      case Z80Register.E:
        op.register = this.cpu.reg.E;
        break;
        
      case Z80Register.H:
        op.register = this.cpu.reg.H;
        break;
        
      case Z80Register.L:
        op.register = this.cpu.reg.L;
        break;
        
      case Z80Register.IXH:
        op.register = this.cpu.reg.IXH;
        break;
        
      case Z80Register.IXL:
        op.register = this.cpu.reg.IXL;
        break;
        
      case Z80Register.IYH:
        op.register = this.cpu.reg.IYH;
        break;
        
      case Z80Register.IYL:
        op.register = this.cpu.reg.IYL;
        break;
        
      default:
        console.warn('Blegh', reg);
    }
    
    op.size = op.register.size;
    /*if(this.cpu.reg[regname] instanceof Register) {
      op.name = regname;
      op.register = this.cpu.reg[regname];
      op.size = op.register.size;
    }*/
  }
  
  private fetchOperand(op: Operand, decode: number) {
    switch(decode >> 8) {
      case 0xA0:
        op.type = OperandClass.Register;
        this.setRegister(op, decode);
        break;
      
      case 0xE0:
        op.type = OperandClass.Flag;
        op.name = FlagNames[decode & 0xFF];
        break;
        
      case 0xF0:
        op.type = OperandClass.Immediate;
        
        switch(decode) {
          case SpecialOp.Immediate8:
            if(this.cbPrefix === false) {
              op.byteVal[0] = this.cpu.bus().readMemory(this.address + this.size);
              this.size++;
            } else {
              op.byteVal[0] = CachedByteBuffer[0];
              this.cbPrefix = false;
            }
            op.size += 1;
            break;
          
          case SpecialOp.Immediate16:
            op.byteVal[0] = this.cpu.bus().readMemory(this.address + this.size);
            op.byteVal[1] = this.cpu.bus().readMemory(this.address + this.size + 1);
            op.size = 2;
            this.size += 2;
            break;
        }
        break;

      default:
        op.type = OperandClass.Immediate;
        op.byteVal[0] = decode & 0xFF;
        op.size = 1;
        break;
    }
  }
  
  private fetch() : (number|number[])[]{
    let prefix: any[] = opcode;
    let decoded: any[] = null;

    this.cbPrefix = false;
    this.size = 0;
    let offset = this.address;
    let bus = this.cpu.bus();
 
    for(let i=0; i < 4; i++) {
      let byte = bus.readMemory(offset);
      offset++;
      
      let current = prefix[byte] || operations[0x0];
        
      this.size++;

      if(current.length === 256) {
        prefix = current;
        
        if(i === 1 && byte === 0xCB) {
          this.cbPrefix = true;
          this.size++;
          CachedByteBuffer[0] = bus.readMemory(offset);
          offset++;
        }
      } else{
        decoded = current;
        break;
      }
    }

    this.opcode = decoded[0];
    return decoded[1];
  }

  public decode(): void {
    const decoded = this.fetch();

    this.operation = operations[this.opcode];
    this.operands = this.opArrayCache[decoded.length];
    
    for(let i=0; i < decoded.length; i++) {
      let op = this.operands[i];
      op.reset();
      this.decodeOperand(op, decoded[i]);
    }
  }

  formatOperand(operand: Operand): string {
    return operand.toString();
  }

  toString(): string {
    let str = this.opcode.toString();
    if(this.operands.length > 0) {
      str += ' ' + this.formatOperand(this.operands[0]);
    }

    if(this.operands.length > 1) {
      str += ', ' + this.formatOperand(this.operands[1]);
    }

    if(this.operands.length > 2) {
      str += ', ' + this.formatOperand(this.operands[2]);
    }

    return str;
  }
}
