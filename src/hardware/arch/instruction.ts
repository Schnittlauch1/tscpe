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
import {Operations, OperationNames} from './z80-operations';
import {operations} from './z80-operations';
import {Z80Cpu} from './z80';
import {Bus} from '../bus';
import {Register} from './z80-register';
import {Z80Register} from './z80-register';
import {opcode} from './opcodes';
import {SpecialOp} from './opcodes';
import {OpFlags} from './opcodes';
import {FlagNames} from './opcodes';
import {nop_instruction} from './opcodes';
import {RegisterNames} from './z80-register';

let CachedByteBuffer = 0;

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
    if(this.register) {
      let adr = this.register.value();
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
        return this.register.value();
        
      default:
        return NaN;
    }
  }
  
  public write(val: number) {
    switch(this.type) {
      case OperandClass.Address:
        this.cpu.bus().writeMemory(this.address(), val);
        break;
        
      case OperandClass.Register:
        this.register.setValue(val);
        break;

      default:
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
  private cpu: Z80Cpu = null;
  private bus: Bus = null;
  address: number = -1;
  private offset: number = -1;
  opcode: Operations = null;
  operation: Operation = operations[Operations.NOP];
  operands: Operand[] = null;
  private cbPrefix: boolean = false;
  size: number = 0;
  private registerCache: Register[] = null;
  public code = [0, 0, 0, 0];
  
  constructor(cpu: Z80Cpu) {
    this.cpu = cpu;
    this.bus = cpu.bus();
    this.opArrayCache = [
      [],
      [new Operand(this.cpu)],
      [new Operand(this.cpu), new Operand(this.cpu)],
      [new Operand(this.cpu), new Operand(this.cpu), new Operand(this.cpu)]
    ];
    this.registerCache = [
      this.cpu.reg.AF, this.cpu.reg.WZ, this.cpu.reg.BC, this.cpu.reg.DE, this.cpu.reg.HL,
      this.cpu.reg.AF_, this.cpu.reg.WZ_, this.cpu.reg.BC_, this.cpu.reg.DE_, this.cpu.reg.HL_,
      this.cpu.reg.IX, this.cpu.reg.IY, this.cpu.reg.SP, this.cpu.reg.PC, this.cpu.reg.I, this.cpu.reg.R, this.cpu.reg.MEMPTR,
      this.cpu.reg.A, this.cpu.reg.F, this.cpu.reg.W, this.cpu.reg.Z, this.cpu.reg.B, this.cpu.reg.C, this.cpu.reg.D, this.cpu.reg.E, this.cpu.reg.H, this.cpu.reg.L,
      this.cpu.reg.IXH, this.cpu.reg.IXL, this.cpu.reg.IYH, this.cpu.reg.IYL
    ];
  }
  
  private opArrayCache: (Operand[])[];

  private decodeAddressOperand(op: Operand, val: any[]) {
    let valLength = val.length;
    for(let i=0; i < valLength; ++i) {
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
    op.name = RegisterNames[reg - 0xA000];
    op.register = this.registerCache[reg - 0xA000];
    op.size = op.register.size();
  }
  
  private fetchRegOperand(op: Operand, decode: number) {
    op.type = OperandClass.Register;
    this.setRegister(op, decode);
  }
  
  private fetchFlagOperand(op: Operand, decode: number) {
    op.type = OperandClass.Flag;
    op.name = FlagNames[decode - 0xE000];
  }
  
  private fetchImmediateOperand(op: Operand, decode: number) {
    op.type = OperandClass.Immediate;
    
    switch(decode) {
      case SpecialOp.Immediate8:
        if(this.cbPrefix === false) {
          op.byteVal[0] = this.bus.readMemory(this.address + this.size);
          ++this.size;
        } else {
          op.byteVal[0] = CachedByteBuffer;
          this.cbPrefix = false;
        }
        op.size = 1;
        break;
      
      case SpecialOp.Immediate16:
        op.byteVal[0] = this.bus.readMemory(this.address + this.size);
        op.byteVal[1] = this.bus.readMemory(this.address + this.size + 1);
        op.size = 2;
        this.size += 2;
        break;

      default:
        console.error('Unknown operand type');
        process.exit(-1);
        break;
    }
  }
  
  private fetchStaticOperand(op: Operand, decode: number) {
    op.type = OperandClass.Immediate;
    op.byteVal[0] = decode;
    op.size = 1;
  }
  
  private fetchOperand(op: Operand, decode: number) {
    let opPrefix = decode & 0xFF00;
    switch(opPrefix) {
      case 0xA000:
        this.fetchRegOperand(op, decode);
        break;
      
      case 0xE000:
        this.fetchFlagOperand(op, decode);
        break;
        
      case 0xF000:
        this.fetchImmediateOperand(op, decode);
        break;

      default:
        this.fetchStaticOperand(op, decode);
        break;
    }
  }
  
  private isPrefix(opcode: number[]): boolean {
    return opcode.length === 256;
  }
  
  private fetchFromMemory(opcodes: (number|number[])[], pos: number) : (number|number[]) {
    let byte = this.bus.readMemory(this.offset);
    this.code[pos] = byte;
    
    ++this.offset;
    ++this.size;
    
    return opcodes[byte];
  }
  
  private fetchCBPrefixImmediate(pos: number) {
    if(pos === 1) {
      this.cbPrefix = true;
      ++this.size;
      CachedByteBuffer = this.bus.readMemory(this.offset);
      ++this.offset;
    }
  }
  
  private fetch() : (number|number[])[]{
    let prefix = opcode;
    let decoded = nop_instruction;

    this.size = 0;
    this.cbPrefix = false;
    this.offset = this.address;
    let current = prefix[0];
 
    let i = 0;
    while(true) {     
      current = this.fetchFromMemory(prefix, i);

      if(this.isPrefix(current)) {
        prefix = current;
        
        this.fetchCBPrefixImmediate(i);
      } else{
        decoded = current;
        break;
      }
      
      ++i;
    }

    this.opcode = <number>decoded[0];
    return <number[]>decoded[1];
  }

  public decode(): void {
    const decoded = this.fetch();

    let decodedLength = decoded.length;
    this.operation = operations[this.opcode];
    this.operands = this.opArrayCache[decodedLength];
    
    for(let i=0; i < decodedLength; ++i) {
      let op = this.operands[i];
      op.reset();
      this.decodeOperand(op, decoded[i]);
    }
  }

  formatOperand(operand: Operand): string {
    return operand.toString();
  }

  toString(): string {
    let str = OperationNames[this.opcode];
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
