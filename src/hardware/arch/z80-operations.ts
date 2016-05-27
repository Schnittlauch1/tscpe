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

import {Z80Cpu} from './z80';
import {Operand} from './instruction';
import {OperandClass} from './instruction';
import {Instruction} from './instruction';
import {Register} from './z80-register';

export const enum Operations {
  NOP, LD, PUSH, POP, EX, EXX,
  LDI, LDIR, LDD, LDDR, CPI,
  CPIR, CPD, CPDR, ADD, ADC, SUB,
  SBC, AND, OR, XOR, CP, INC, DEC,
  DAA, CPL, NEG, CCF, SCF, HALT,
  DI, EI, IM, RLCA, RLA, RRA, RLC,
  RL, RRC, RRCA, RR, SLA, SRA, SRL, 
  RLD, RRD, BIT, SET, RES, JP, JR, 
  DJNZ, CALL, RET, RETI, RETN, RST, 
  IN, INI, INIR, IND, INDR, OUT, 
  OUTI, OTIR, OUTD, OTDR, SLL,
  OperationsCount
};

export type Operation = (cpu: Z80Cpu, instruction: Instruction) => number;

interface CPUVal {
  val?: Uint8Array;
  valNum?: number;
  adr?: number;
  srcReg?: Register;
  reg?: Register;
}

export function add(cpu: Z80Cpu, a: number, b: number, carryIn: boolean): number {
  let result = 0;
  let c1 = false;
  let c2 = false;
  let overflowCarry: boolean;
  let carry: boolean = carryIn;
  let signCarry: boolean = false;
  
  a = a|0;
  b = b|0;
  
  for(let i=0; i < 8; i++) {
    let aB: boolean = (a & (0x1 << i)) !== 0;
    let bB: boolean = (b & (0x1 << i)) !== 0;
    let rB1 = false;
    let rB2 = false;
    
    rB1 = aB !== bB; 
    rB2 = rB1 !== carry; 
    
    if(rB2) { result |= (1 << i); }

    c1 = aB && bB;
    c2 = rB1 && carry;

    carry = c2 || c1;
    
    if(i === 3) { cpu.halfCarryFlag = carry; } 
    if(i === 6) { signCarry = carry; }
  }
  
  cpu.signFlag = (result & 0x80) !== 0;
  cpu.carryFlag = carry;
  cpu.parityFlag = carry !== signCarry;
  cpu.additionFlag = false;
  cpu.zeroFlag = result === 0;
  
  return result;
}

export function sub(cpu: Z80Cpu, a: number, b: number, carry: boolean): number {
  carry = carry !== true;
  let res = add(cpu, a, ~b, carry);
  
  cpu.additionFlag = true;
  cpu.halfCarryFlag = !cpu.halfCarryFlag;
  cpu.carryFlag = !cpu.carryFlag; 
  
  return res;
}

export function parity(a: number): boolean {
  let count=0;
  
  for(let i=0; i < 8; i++) {
    if((a & (0x1 << i)) !== 0) { count++; }
  }
  
  return (count % 2) === 0;
}

export const operations: Operation[] = new Array(Operations.OperationsCount);
//export const operations: { [op: string]: Operation } = {};// = {

operations[Operations.NOP] = function NOP(cpu, instruction) {
  return 4;
};

operations[Operations.HALT] = function HALT(cpu, instruction) {
  cpu.iff1 = true;
  cpu.reg.PC.uint--;
  return 4;
};

operations[Operations.LD] = function LD(cpu, instruction) {
  const srcOp = instruction.operands[1];
  const dstOp = instruction.operands[0];
  
  if(dstOp.type === OperandClass.Register && (srcOp.type === OperandClass.Register || srcOp.type === OperandClass.Immediate)) {
    dstOp.write(srcOp.read());
  } else if(dstOp.type === OperandClass.Address && srcOp.type === OperandClass.Immediate) {
    let adr = dstOp.address();
    
    cpu.bus().writeMemory(adr, srcOp.byteVal[0]);
    if(srcOp.size > 1) {
      cpu.bus().writeMemory(adr + 1, srcOp.byteVal[1]);
    }
  } else if(dstOp.type === OperandClass.Register && srcOp.type === OperandClass.Address) {
    if(dstOp.size == 1) {
      dstOp.write(srcOp.read());
    } else {
      dstOp.register.lo.uint = cpu.bus().readMemory(srcOp.address());
      dstOp.register.hi.uint = cpu.bus().readMemory(srcOp.address() + 1);
    }
  } else if(dstOp.type === OperandClass.Address && srcOp.type === OperandClass.Register) {
    if(srcOp.size == 1) {
      dstOp.write(srcOp.read());
    } else {
      cpu.bus().writeMemory(dstOp.address(),      srcOp.register.lo.uint);
      cpu.bus().writeMemory(dstOp.address() + 1,  srcOp.register.hi.uint);
    }
  } else {
    console.log('Not Implemented!');
    console.log(dstOp);
    console.log(srcOp);
  }
  
  if(dstOp.register === cpu.reg.AF || dstOp.register === cpu.reg.F) {
    cpu.readFlags(cpu.reg.F.uint);
  }
  
  //TODO Correct timings
  if(this.code && (this.code[0] & 0xC0) === 0xC0) { 
    return 4;
  } else {
    return 8;
  }
};

operations[Operations.JP] = function JP(cpu, instruction) {
  let valOp = 0;
  
  if(instruction.operands.length > 1) {
    switch(instruction.operands[0].name) {
      case 'C':   if(!cpu.carryFlag) { return 10; } break;
      case 'NC':  if(cpu.carryFlag) { return 10; } break;
      case 'Z':   if(!cpu.zeroFlag) { return 10; } break;
      case 'NZ':  if(cpu.zeroFlag) { return 10; } break;
      case 'PO':  if(cpu.parityFlag) { return 10; } break;
      case 'PE':  if(!cpu.parityFlag) { return 10; } break;
      case 'M':   if(!cpu.signFlag) { return 10; } break;
      case 'P':   if(cpu.signFlag) { return 10; } break;
    }
    valOp++;
  } 
  
  const op = instruction.operands[valOp];
  if(op.type === OperandClass.Register) {
    cpu.reg.PC.uint = op.address();
    if(op.name === 'HL') {
      return 4;
    } else if(op.name === 'IX') {
      return 8;
    }
    
    console.log(op);
    console.log('!!!!!!!!!! UNSUPPORTED JP');
  } else {
    cpu.reg.PC.uint = op.address();
    return 10;
  }
};

operations[Operations.JR] = function JR(cpu, instruction) {
  let valOp = 0;
  
  if(instruction.operands.length > 1) {
    switch(instruction.operands[0].name) {
      case 'C':   if(!cpu.carryFlag) { return 7; } break;
      case 'NC':  if(cpu.carryFlag) { return 7; } break;
      case 'Z':   if(!cpu.zeroFlag) { return 7; } break;
      case 'NZ':  if(cpu.zeroFlag) { return 7; } break;
      case 'PO':  if(cpu.parityFlag) { return 7; } break;
      case 'PE':  if(!cpu.parityFlag) { return 7; } break;
      case 'M':   if(!cpu.signFlag) { return 7; } break;
      case 'P':   if(cpu.signFlag) { return 7; } break;
    }
    valOp++;
  } 

  cpu.reg.PC.uint = instruction.operands[valOp].address();

  return 12;
};

operations[Operations.OUT] = function OUT(cpu, instruction) {
  const port = instruction.operands[0];
  const val = instruction.operands[1];
  let waitStates: number = 12;

  if(port.register) {
    cpu.ioBus().select(port.register.wideRead());
  } else {
    cpu.ioBus().select(port.address());
    
    waitStates = 11;
  }
  cpu.ioBus().write(val.read());

  return waitStates;
};

operations[Operations.IN] = function IN(cpu, instruction) {
  const port = instruction.operands[1];
  const dst = instruction.operands[0];
  let affectFlags: boolean = true;

  if(port.type === OperandClass.Register) {
    cpu.ioBus().select(port.register.wideRead());
  } else {
    cpu.ioBus().select(port.address());
    
    affectFlags = false;
  }
  dst.write(cpu.ioBus().read());
  
  if(affectFlags) {
    cpu.parityFlag = parity(dst.read());
    cpu.additionFlag = false;
    cpu.halfCarryFlag = false;
    cpu.zeroFlag = dst.read() === 0;
    cpu.signFlag = (dst.read() & 0x80) !== 0;
    
    return 12; 
  }

  return 11;
};

operations[Operations.INC] = function INC(cpu, instruction) {
  const val = instruction.operands[0];
  let oldVal: number;
  let carry = cpu.carryFlag;
  let waitStates = 12;
  
  if(val.type === OperandClass.Register) {
    if(val.size == 1) {
      oldVal = val.read();
      val.write(add(cpu, oldVal, 1, false));
    } else {
      let wReg = val.register;
      let flags = cpu.reg.F.uint;
      
      wReg.lo.uint = add(cpu, wReg.lo.uint, 1, false);
      wReg.hi.uint = add(cpu, wReg.hi.uint, 0, cpu.carryFlag);
      cpu.readFlags(flags);
      
      return waitStates;
    }
  } else if(val.type === OperandClass.Address) {
    let memVal = val.read();
    oldVal = memVal;
    val.write(add(cpu, memVal, 1, false));
    waitStates = 11;
  } else {
    console.log('Wtf?');
  }
  
  cpu.carryFlag = carry;
  cpu.parityFlag = oldVal == 0x7F;

  return waitStates;
}

operations[Operations.DEC] = function DEC(cpu, instruction) {
  const val = instruction.operands[0];
  let oldVal: number;
  let carry = cpu.carryFlag;

  if(val.type === OperandClass.Register) {
    if(val.size === 1) {
      oldVal = val.read();
      val.write(sub(cpu, oldVal, 1, false));
    } else {
      let wReg = val.register;
      let flags = cpu.reg.F.uint;

      wReg.lo.uint = sub(cpu, wReg.lo.uint, 1, false);
      wReg.hi.uint = sub(cpu, wReg.hi.uint, 0, cpu.carryFlag);
      
      cpu.readFlags(flags);
      
      //TODO Correct timings
      return 4;
    }
  } else if(val.type === OperandClass.Address) {
    let memVal = cpu.bus().readMemory(val.address());
    oldVal = memVal;
    val.write(sub(cpu, memVal, 1, false));
  } else {
    console.log('Wtf?');
  }

  cpu.carryFlag = carry;
  cpu.parityFlag = oldVal === 0x80;

  //TODO Correct timings
  return 4;
}

operations[Operations.CALL] = function CALL(cpu, instruction) {
  let valOp = 0;
  
  if(instruction.operands.length > 1) {
    switch(instruction.operands[0].name) {
      case 'C':   if(!cpu.carryFlag) { return 17; } break;
      case 'NC':  if(cpu.carryFlag) { return 17; } break;
      case 'Z':   if(!cpu.zeroFlag) { return 17; } break;
      case 'NZ':  if(cpu.zeroFlag) { return 17; } break;
      case 'PO':  if(cpu.parityFlag) { return 17; } break;
      case 'PE':  if(!cpu.parityFlag) { return 17; } break;
      case 'M':   if(!cpu.signFlag) { return 17; } break;
      case 'P':   if(cpu.signFlag) { return 17; } break;
    }
    valOp++;
  } 
  
  let val = instruction.operands[valOp];
  cpu.reg.SP.uint--;
  cpu.bus().writeMemory(cpu.reg.SP.uint, cpu.reg.PC.hi.uint);
  cpu.reg.SP.uint--;
  cpu.bus().writeMemory(cpu.reg.SP.uint, cpu.reg.PC.lo.uint);

  cpu.reg.PC.uint = val.address();
  
  return 17;
}

operations[Operations.RST] = function RST(cpu, instruction) {
  let val = instruction.operands[0];
  cpu.reg.SP.uint--;
  cpu.bus().writeMemory(cpu.reg.SP.uint, cpu.reg.PC.hi.uint);
  cpu.reg.SP.uint--;
  cpu.bus().writeMemory(cpu.reg.SP.uint, cpu.reg.PC.lo.uint);

  cpu.reg.PC.lo.uint = val.read();
  cpu.reg.PC.hi.uint = 0;
  
  return 11;
};

operations[Operations.RET] = function RET(cpu, instruction) {
  let waitStates = 10;
  
  if(instruction.operands.length === 1) {
    switch(instruction.operands[0].name) {
      case 'C':   if(!cpu.carryFlag) { return 5; } break;
      case 'NC':  if(cpu.carryFlag) { return 5; } break;
      case 'Z':   if(!cpu.zeroFlag) { return 5; } break;
      case 'NZ':  if(cpu.zeroFlag) { return 5; } break;
      case 'PO':  if(cpu.parityFlag) { return 5; } break;
      case 'PE':  if(!cpu.parityFlag) { return 5; } break;
      case 'M':   if(!cpu.signFlag) { return 5; } break;
      case 'P':   if(cpu.signFlag) { return 5; } break;
    }
    
    waitStates = 11;
  }   

  cpu.reg.PC.lo.uint = cpu.bus().readMemory(cpu.reg.SP.uint);
  cpu.reg.SP.uint++;
  cpu.reg.PC.hi.uint = cpu.bus().readMemory(cpu.reg.SP.uint);
  cpu.reg.SP.uint++;

  return waitStates;
}

operations[Operations.PUSH] = function PUSH(cpu, instruction) {
  let op = instruction.operands[0];
  let reg = op.register;
  
  cpu.reg.SP.uint--;
  cpu.bus().writeMemory(cpu.reg.SP.uint, reg.hi.uint);
  
  cpu.reg.SP.uint--;
  cpu.bus().writeMemory(cpu.reg.SP.uint, reg.lo.uint);
  
  return 11;
}

operations[Operations.POP] = function POP(cpu, instruction) {
  let op = instruction.operands[0];
  let reg = op.register;
  
  reg.lo.uint = cpu.bus().readMemory(cpu.reg.SP.uint);
  cpu.reg.SP.uint++;
  reg.hi.uint = cpu.bus().readMemory(cpu.reg.SP.uint);
  cpu.reg.SP.uint++;
  
  cpu.readFlags(cpu.reg.F.uint);
  
  return 10;
}

operations[Operations.LDI] = function LDI(cpu, instruction) {
  let srcAdr = cpu.reg.HL.uint;
  let dstAdr = cpu.reg.DE.uint;
  
  cpu.bus().writeMemory(dstAdr, cpu.bus().readMemory(srcAdr));

  cpu.reg.HL.uint += 1;
  cpu.reg.DE.uint += 1;
  cpu.reg.BC.uint -= 1;
  
  cpu.parityFlag = (cpu.reg.BC.uint -1) !== 0;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;
  
  return 16;
}

operations[Operations.LDIR] = function LDIR(cpu, instruction) {
  let waitStates: number;
  
  waitStates = operations[Operations.LDI](cpu, instruction);
  
  if(cpu.reg.BC.uint !== 0) {
    cpu.reg.PC.uint -= 2;
    waitStates += 5;
  }
  
  cpu.halfCarryFlag = false;
  cpu.parityFlag = false;
  cpu.additionFlag = false;
  
  return waitStates;
}

operations[Operations.LDD] = function LDD(cpu, instruction) {
  let srcAdr = cpu.reg.HL.uint;
  let dstAdr = cpu.reg.DE.uint;
  
  cpu.bus().writeMemory(dstAdr, cpu.bus().readMemory(srcAdr));

  cpu.reg.HL.uint -= 1;
  cpu.reg.DE.uint -= 1;
  cpu.reg.BC.uint -= 1;
  
  cpu.parityFlag = (cpu.reg.BC.uint -1) !== 0;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;
  
  return 16;
}

operations[Operations.LDDR] = function LDDR(cpu, instruction) {
  let waitStates: number;
  
  waitStates = operations[Operations.LDD](cpu, instruction);
  if(cpu.reg.BC.uint !== 0) {
    cpu.reg.PC.uint -= 2;
    waitStates += 5;
  }
  
  cpu.halfCarryFlag = false;
  cpu.parityFlag = false;
  cpu.additionFlag = false;
  
  return waitStates;
}

function swapReg(reg1: Register, reg2: Register) {
  let val = reg1.uint;
  reg1.uint = reg2.uint;
  reg2.uint = val;
}

operations[Operations.EX] = function EX(cpu, instruction) {
  let op1 = instruction.operands[0];
  let op2 = instruction.operands[1];
  
  if(op1.type === OperandClass.Register && op2.type === OperandClass.Register) {
    swapReg(op1.register, op2.register);
  } else if(op1.type === OperandClass.Address && op2.type === OperandClass.Register) {
    let memH = cpu.bus().readMemory(op1.address()+1);
    let memL = cpu.bus().readMemory(op1.address());
    let reg = op2.register;
    
    cpu.bus().writeMemory(op1.address()+1, reg.hi.uint);
    cpu.bus().writeMemory(op1.address(),   reg.lo.uint);
    reg.hi.uint = memH;
    reg.lo.uint = memL;
  } else {
    console.log('Wtf?');
  }
  
  cpu.readFlags(cpu.reg.F.uint);
  
  //TODO Correct timings
  return 4;
}

operations[Operations.EXX] = function EXX(cpu, instruction) {
  swapReg(cpu.reg.BC, cpu.reg.BC_);
  swapReg(cpu.reg.DE, cpu.reg.DE_);
  swapReg(cpu.reg.HL, cpu.reg.HL_);
  
  return 4;
}

operations[Operations.AND] = function AND(cpu, instruction) {
  let dstReg = cpu.reg.A;
  let oldVal = dstReg.uint;
  
  let rh = instruction.operands[0];
  let rhVal: number = rh.read();
  
  dstReg.uint = dstReg.uint & rhVal;
  
  cpu.zeroFlag = (dstReg.uint === 0);
  cpu.signFlag = (dstReg.uint & 0x80) !== 0;
  
  cpu.carryFlag = false;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = true;
  if((oldVal & 0x80) === (rhVal & 0x80) && (dstReg.uint & 0x80) !== (oldVal & 0x80)) {
    cpu.parityFlag = true;
  } else {
    cpu.parityFlag = false;
  }
  
  //TODO Correct timings
  return 4;
}

operations[Operations.XOR] = function XOR(cpu, instruction) {
  let dstReg = cpu.reg.A;
  let rh =  instruction.operands[0];

  dstReg.uint = dstReg.uint ^ rh.read();
  
  cpu.zeroFlag = dstReg.uint === 0;
  cpu.signFlag = (dstReg.uint & 0x80) !== 0;
  
  cpu.carryFlag = false;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;
  cpu.parityFlag = parity(dstReg.uint);
  
  //TODO Correct timings
  return 4;
}

operations[Operations.OR] = function OR(cpu, instruction) {
  let dstReg = cpu.reg.A;
  let oldVal = dstReg.uint;
  
  let rh = instruction.operands[0];
  let rhVal: number = rh.read();
  
  dstReg.uint = dstReg.uint | rhVal;
  
  cpu.zeroFlag = dstReg.uint === 0;
  cpu.signFlag = (dstReg.uint & 0x80) !== 0;
  
  cpu.carryFlag = false;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;
  
  if((oldVal & 0x80) === (rhVal & 0x80) && (dstReg.uint & 0x80) !== (oldVal & 0x80)) {
    cpu.parityFlag = true;
  } else {
    cpu.parityFlag = false;
  }
  
  //TODO Correct timings
  return 4;
}

operations[Operations.ADD] = function ADD(cpu, instruction) {
  let flags = cpu.reg.F.uint;
  
  if(instruction.operands.length === 1) {
    const op = instruction.operands[0];
    cpu.reg.A.uint = add(cpu, cpu.reg.A.uint, op.read(), false);
  } else {
    const dst = instruction.operands[0];
    const val = instruction.operands[1];
    
    if(dst.size === 1) {
      dst.write(add(cpu, dst.read(), val.read(), false)); 
    } else {
      const target = dst.register;
      const value = val.register;
      
      target.lo.uint = add(cpu, target.lo.uint, value.lo.uint, false);
      target.hi.uint = add(cpu, target.hi.uint, value.hi.uint, cpu.carryFlag);
      
      if(dst.name == 'IX' || dst.name == 'IY' || dst.name == 'HL') {
        let halfCarry = cpu.halfCarryFlag;
        let carry = cpu.carryFlag;
        
        cpu.readFlags(flags);
        
        cpu.halfCarryFlag = halfCarry;
        cpu.carryFlag = carry;
        cpu.additionFlag = false;
      }
    }
  }
  
  //TODO Correct timings
  return 4;
}

operations[Operations.ADC] = function ADC(cpu, instruction) {
  let flags = cpu.reg.F.uint;
  
  if(instruction.operands.length === 1) {
    const op = instruction.operands[0];

    cpu.reg.A.uint = add(cpu, cpu.reg.A.uint, op.read(), cpu.carryFlag);
  } else {
    const dst = instruction.operands[0];
    const val = instruction.operands[1];
    
    if(dst.size === 1) {
      dst.write(add(cpu, dst.read(), val.read(), cpu.carryFlag));
    } else {
      const target = dst.register;
      const value = val.register;
      
      target.lo.uint = add(cpu, target.lo.uint, value.lo.uint, cpu.carryFlag);
      target.hi.uint = add(cpu, target.hi.uint, value.hi.uint, cpu.carryFlag);
      
      if(dst.name == 'IX' || dst.name == 'IY') {
        let halfCarry = cpu.halfCarryFlag;
        let carry = cpu.carryFlag;
        
        cpu.readFlags(flags);
        cpu.halfCarryFlag = halfCarry;
        cpu.carryFlag = carry;
      }
    }
  }
    
  //TODO Correct timings
  return 4;
}

operations[Operations.SUB] = function SUB(cpu, instruction) {
  let flags = cpu.reg.F.uint;
  
  if(instruction.operands.length === 1) {
    const op = instruction.operands[0];

    cpu.reg.A.uint = sub(cpu, cpu.reg.A.uint, op.read(), false); 
  } else {
    const dst = instruction.operands[0];
    const val = instruction.operands[1];
    
    if(dst.size === 1) {
      dst.write(sub(cpu, dst.read(), val.read(), false));
    } else {
      const target = dst.register;
      const value = val.register;
      
      target.lo.uint = sub(cpu, target.lo.uint, value.lo.uint, false);
      target.hi.uint = sub(cpu, target.hi.uint, value.hi.uint, cpu.carryFlag);
      
      if(dst.name == 'IX' || dst.name == 'IY') {
        let halfCarry = cpu.halfCarryFlag;
        let carry = cpu.carryFlag;
        
        cpu.readFlags(flags);
        cpu.halfCarryFlag = halfCarry;
        cpu.carryFlag = carry;
      }
    }
  }
  
  //TODO Correct timings
  return 4;
}

operations[Operations.SBC] = function SBC(cpu, instruction) {
  let flags = cpu.reg.F.uint;
  
  if(instruction.operands.length === 1) {
    const op = instruction.operands[0];

    cpu.reg.A.uint = sub(cpu, cpu.reg.A.uint, op.read(), cpu.carryFlag);
  } else {
    const dst = instruction.operands[0];
    const val = instruction.operands[1];
    
    if(dst.size === 1) {
      dst.write(sub(cpu, dst.read(), val.read(), cpu.carryFlag));
    } else {
      const target = dst.register;
      const value = val.register;
      
      target.lo.uint = sub(cpu, target.lo.uint, value.lo.uint, cpu.carryFlag);
      target.hi.uint = sub(cpu, target.hi.uint, value.hi.uint, cpu.carryFlag);
      
      if(dst.name == 'IX' || dst.name == 'IY') {
        let halfCarry = cpu.halfCarryFlag;
        let carry = cpu.carryFlag;
        
        cpu.readFlags(flags);
        cpu.halfCarryFlag = halfCarry;
        cpu.carryFlag = carry;
      }
    }
  }
  
  //TODO Correct timings
  return 4;
}

operations[Operations.DJNZ] = function DJNZ(cpu, instruction) {
  let flags = cpu.reg.F.uint;
  let val = instruction.operands[0];
  cpu.reg.B.uint = sub(cpu, cpu.reg.B.uint, 1, false);
  
  cpu.readFlags(flags);
  
  if(cpu.reg.B.uint === 0) { 
    return 8; 
  }
  
  cpu.reg.PC.uint = val.address();
    
  return 13;
}

operations[Operations.CP] = function CP(cpu, instruction)  {
  let op = instruction.operands[0];
  let cmpVal = op.read();
  
  sub(cpu, cpu.reg.A.uint, cmpVal, false);
  
  //TODO Correct timings
  return 4;
}

operations[Operations.CPL] = function CPL(cpu, instruction) {
  cpu.reg.A.uint = ~cpu.reg.A.uint;
  
  cpu.additionFlag = true;
  cpu.halfCarryFlag = true;
  
  //TODO Correct timings
  return 4;
}

operations[Operations.RRCA] = function RRCA(cpu, instruction) {
  let flags = cpu.reg.F.uint;
  operations[Operations.RRC](cpu, instruction);
  let carry = cpu.carryFlag;
  
  cpu.readFlags(flags);
  cpu.carryFlag = carry;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  return 4;
}

operations[Operations.RRC] = function RRC(cpu, instruction) {
  let op: Operand;
  let val: number;
  
  if(instruction.operands.length > 0) {
    op = instruction.operands[0];
    val = op.read();
  } else {
    val = cpu.reg.A.uint;
  }
  
  let carry: number;
  
  carry = val & 0x01;
  val = val >> 1;
  val |= carry << 7; 
  
  if(op) {
    op.write(val);
  } else {
    cpu.reg.A.uint = val;
  }

  cpu.zeroFlag = val === 0;
  cpu.signFlag = (val & 0x80) !== 0;
  cpu.parityFlag = parity(val);
  cpu.carryFlag = carry !== 0;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  //TODO Correct timings
  return 4;
}

function RotateLeftCarry(cpu: Z80Cpu, val: number): number {
  let carry: number;
  
  carry = val & 0x80;
  val = val << 1;
  val |= carry >> 7
  
  cpu.zeroFlag = val === 0;
  cpu.signFlag = (val & 0x80) !== 0;
  cpu.parityFlag = parity(val);
  cpu.carryFlag = carry !== 0;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  return val;
}

operations[Operations.RLC] = function RLC(cpu, instruction) {
  let op = instruction.operands[0];
  
  op.write(RotateLeftCarry(cpu, op.read()));
  
  //TODO Correct timings
  return 4;
}

operations[Operations.RLCA] = function RLCA(cpu, instruction) {
  let flags = cpu.reg.F.uint;
  
  cpu.reg.A.uint = RotateLeftCarry(cpu, cpu.reg.A.uint);
  
  let carry = cpu.carryFlag;
  
  cpu.readFlags(flags);
  cpu.carryFlag = carry;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  return 4;
}

operations[Operations.RLA] = function RLA(cpu, instruction) {
    let flags = cpu.reg.F.uint;
  operations[Operations.RL](cpu, instruction);
  let carry = cpu.carryFlag;
  
  cpu.readFlags(flags);
  cpu.carryFlag = carry;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  return 4;
}

operations[Operations.RL] = function RL(cpu, instruction) {
  let op: Operand;
  let val: number;
  
  if(instruction.operands.length > 0) {
    op = instruction.operands[0];
    val = op.read();
  } else {
    val = cpu.reg.A.uint;
  }
  
  let carry: number;
  let oldCarry = cpu.carryFlag;

  carry = val & 0x80;
  
  val = val << 1;
  if(oldCarry) {
    val |= 0x1;
  }
  
  if(op) {
    op.write(val);
  } else {
    cpu.reg.A.uint = val;
  }
  
    
  cpu.zeroFlag = val === 0;
  cpu.signFlag = (val & 0x80) !== 0;
  cpu.parityFlag = parity(val);
  cpu.carryFlag = carry !== 0;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  //TODO Correct timings
  return 4;
}

operations[Operations.RRA] = function RRA(cpu, instruction) { 
  let flags = cpu.reg.F.uint;
  operations[Operations.RR](cpu, instruction);
  let carry = cpu.carryFlag;
  
  cpu.readFlags(flags);
  cpu.carryFlag = carry;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  return 4;
}


operations[Operations.RR] = function RR(cpu, instruction) {
  let op: Operand;
  let val: number;
  
  if(instruction.operands.length > 0) {
    op = instruction.operands[0];
    val = op.read();
  } else {
    val = cpu.reg.A.uint;
  }
  
  let carry: number;
  let oldCarry: boolean = cpu.carryFlag;
  
  if(!op || op.type === OperandClass.Register) {
    carry = val & 0x01;
    
    val = val >> 1;
    if(oldCarry) {
      val |= 0x80;
    }
    
    cpu.parityFlag = parity(val);
    cpu.zeroFlag = val === 0;
    cpu.signFlag = (val & 0x80) !== 0;
  
  } else  {
    carry = val & 0x01;
    
    val = val >> 1;
    if(oldCarry) {
      val |= 0x80;
    }
    
    cpu.parityFlag = parity(val);
    cpu.zeroFlag = val === 0;
    cpu.signFlag = (val & 0x80) !== 0;
  }
  
  if(op) {
    op.write(val);
  } else {
    cpu.reg.A.uint = val;
  }

  cpu.carryFlag = carry !== 0;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  
  //TODO Correct timings
  return 4;
}

operations[Operations.SLA] = function SLA(cpu, instruction) {
  let op = instruction.operands[0];
  let val: number = op.read();
  
  let carry = val & 0x80;
  
  val = val << 1;
  
  cpu.carryFlag = carry !== 0;
  cpu.signFlag = carry !== 0;
  cpu.parityFlag = parity(val);
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  cpu.zeroFlag = val === 0;
  
  op.write(val);
  
  //TODO Correct timings
  return 4; 
}

operations[Operations.SRA] = function SRA(cpu, instruction) {
  let op = instruction.operands[0];
  let val: number = op.read();

  let carry = val & 0x01;
  let lastBit = val & 0x80;
  
  
  val = val >> 1;
  val |= lastBit;
 
  cpu.carryFlag = carry !== 0;
  cpu.signFlag = lastBit !== 0;
  cpu.parityFlag = parity(val);
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  cpu.zeroFlag = val === 0;
  
  op.write(val);
  
  //TODO Correct timings
  return 4;
}

operations[Operations.SRL] = function SRL(cpu, instruction) {
  let op = instruction.operands[0];
  let carry: number;
  let val: number = op.read();;
 
  carry = val & 0x01;
  val = val >> 1; 
  cpu.parityFlag = parity(val);
  
  op.write(val);

  cpu.zeroFlag = val === 0;
  cpu.carryFlag = carry !== 0;
  cpu.signFlag = false;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  //TODO Correct timings
  return 4;
}


operations[Operations.DI] = function DI(cpu, instruction) {
  cpu.iff1 = false;
  cpu.iff2 = false;
  
  //TODO Correct timings
  return 4;
}

operations[Operations.EI] = function EI(cpu, instruction) {
  cpu.iff1 = true;
  cpu.iff2 = true;
  
  //TODO Correct timings
  return 4;
}

operations[Operations.IM] = function IM(cpu, instruction) {
  cpu.im = instruction.operands[0].byteVal[0];
  
  console.log('IM', cpu.im);
 
  //TODO Correct timings
  return 4;
}

operations[Operations.RETI] = function RETI(cpu, instruction) {
  return operations[Operations.RET](cpu, instruction);
}

operations[Operations.RETN] = function RETN(cpu, instruction) {
  cpu.iff1 = cpu.iff2;
  
  return operations[Operations.RET](cpu, instruction);
}

operations[Operations.SCF] = function SCF(cpu, instruction) {
  cpu.carryFlag = true;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;
  
  //TODO Correct timings
  return 4;
}

operations[Operations.CCF] = function CCF(cpu, instruction) {
  cpu.halfCarryFlag = cpu.carryFlag;
  cpu.carryFlag = !cpu.carryFlag;
  cpu.additionFlag = false;
  
  //TODO Correct timings
  return 4;
}

operations[Operations.BIT] = function BIT(cpu, instruction) {
  let bit = <number>instruction.operands[0].byteVal[0];
  let val = instruction.operands[1];
 
  cpu.zeroFlag = (val.read() & (0x1 << bit)) === 0;
  
  cpu.additionFlag = false;
  cpu.halfCarryFlag = true;
  
  //TODO Correct timings
  return 4;
}

operations[Operations.SET] = function SET(cpu, instruction) {
  let bit = <number>instruction.operands[0].byteVal[0];
  let val = instruction.operands[1];

  val.write(val.read() | (0x1 << bit));
  
  //TODO Correct timings
  return 4;
}

operations[Operations.RES] = function RES(cpu, instruction) {
  let bit = <number>instruction.operands[0].byteVal[0];
  let val = instruction.operands[1];

  val.write(val.read() & ~(0x1 << bit));
  
  //TODO Correct timings
  return 4;
}

operations[Operations.DAA] = function DAA(cpu, instruction) {
  let regVal = cpu.reg.A.uint;
  let addFlag: boolean = cpu.additionFlag;
  
  if((regVal & 0xF) > 9 || cpu.halfCarryFlag) {
    regVal = add(cpu, regVal, 0x6, false);
  }
  
  if(((regVal & 0xF0) >> 4) > 9 || cpu.carryFlag) {
    regVal = add(cpu,regVal, 0x60, false);
    cpu.carryFlag = true;
  } else {
    cpu.carryFlag = false;
  }
  
  cpu.additionFlag = addFlag;
  cpu.parityFlag = parity(regVal);
  
  cpu.reg.A.uint = regVal;
  
  //TODO Correct timings
  return 4;
}