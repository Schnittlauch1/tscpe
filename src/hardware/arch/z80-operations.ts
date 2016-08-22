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
  LD_RLC, LD_RRC, LD_RL, LD_RR, LD_SLA, LD_SRA, LD_SLL, LD_SRL,
  LD_RES, LD_SET,
  LD_RN, LD_RN_FLAGS,
  PUSH_FLAGS, POP_FLAGS,
  OperationsCount
};

export const OperationNames:string[] = [
  'NOP', 'LD', 'PUSH', 'POP', 'EX', 'EXX',
  'LDI', 'LDIR', 'LDD', 'LDDR', 'CPI', 
  'CPIR', 'CPD', 'CPDR', 'ADD', 'ADC', 'SUB',
  'SBC', 'AND', 'OR', 'XOR', 'CP', 'INC', 'DEC',
  'DAA', 'CPL', 'NEG', 'CCF', 'SCF', 'HALT',
  'DI', 'EI', 'IM', 'RLCA', 'RLA', 'RRA', 'RLC',
  'RL', 'RRC', 'RRCA', 'RR', 'SLA', 'SRA', 'SRL',
  'RLD', 'RRD', 'BIT', 'SET', 'RES', 'JP', 'JR',
  'DJNZ', 'CALL', 'RET', 'RETI', 'RETN', 'RST',
  'IN', 'INI', 'INIR', 'IND', 'INDR', 'OUT',
  'OUTI', 'OTIR', 'OUTD', 'OTDR', 'SLL',
  'LD_RLC', 'LD_RRC', 'LD_RL', 'LD_RR', 'LD_SLA', 'LD_SRA', 'LD_SLL', 'LD_SRL',
  'LD_RES', 'LD_SET',
  'LD', 'LD',
  'PUSH', 'POP'
]

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
  let carry = 0;
  
  if(carryIn) { carry = 1; }
  
  result = a + b + carry;
  
  cpu.halfCarryFlag = false; 
  cpu.zeroFlag = false;
  cpu.carryFlag = false;
  cpu.parityFlag = false;
  cpu.signFlag = false;
  cpu.additionFlag = false;
  
  if((result & 0x80) !== 0) { cpu.signFlag = true; }
  if(((a & 0x0F) + (b & 0x0F) + carry) > 0x0F) {
    cpu.halfCarryFlag = true;
  }
  
  if(result > 0xFF) { cpu.carryFlag = true; }
  
  result = result & 0xFF;
  if(result === 0) { cpu.zeroFlag = true; }
  cpu.parityFlag = (((result ^ a ^ b) & 0x80) !== 0) !== cpu.carryFlag;
  
  return result;
}

export function sub(cpu: Z80Cpu, a: number, b: number, carry: boolean): number {
  carry = carry !== true;
  let res = add(cpu, a, ~b & 0xFF, carry);
  
  cpu.additionFlag = true;
  cpu.halfCarryFlag = !cpu.halfCarryFlag;
  cpu.carryFlag = !cpu.carryFlag; 
  
  return res;
}

export function parity(a: number): boolean {
  let result: number = 0;
  
  result = a ^ (a >> 1);
  result = result ^ (result >> 2);
  result = result ^ (result >> 4);
  
  return (result & 1) === 0;
}

export const operations: Operation[] = new Array(Operations.OperationsCount);
//export const operations: { [op: string]: Operation } = {};// = {

operations[Operations.NOP] = function NOP(cpu, instruction) {
  return 4;
};

operations[Operations.HALT] = function HALT(cpu, instruction) {
  cpu.iff1 = true;
  cpu.reg.PC.decr();
  return 4;
};

operations[Operations.LD_RN] = function LD_RN(cpu: Z80Cpu, instruction: Instruction) {
  instruction.operands[0].write(instruction.operands[1].read());
  return 4; //Fix Timestamp
}

operations[Operations.LD] = function LD(cpu, instruction) {
  const srcOp = instruction.operands[1];
  const dstOp = instruction.operands[0];

  if(dstOp.type === OperandClass.Address && srcOp.type === OperandClass.Immediate) {
    let adr = dstOp.address();
    
    cpu.bus().writeMemory(adr, srcOp.byteVal[0]);
    if(srcOp.size == 2) {
      cpu.bus().writeMemory(adr + 1, srcOp.byteVal[1]);
    }
  } else if(dstOp.type === OperandClass.Register && srcOp.type === OperandClass.Address) {
    if(dstOp.size == 1) {
      dstOp.write(srcOp.read());
    } else {
      dstOp.register.lo.setValue(cpu.bus().readMemory(srcOp.address()));
      dstOp.register.hi.setValue(cpu.bus().readMemory(srcOp.address() + 1));
    }
  } else if(dstOp.type === OperandClass.Address && srcOp.type === OperandClass.Register) {
    if(srcOp.size == 1) {
      dstOp.write(srcOp.read());
    } else {
      cpu.bus().writeMemory(dstOp.address(),      srcOp.register.lo.value());
      cpu.bus().writeMemory(dstOp.address() + 1,  srcOp.register.hi.value());
    }
  } else {
    console.log('Not Implemented!');
    console.log(dstOp);
    console.log(srcOp);
  }
  
  //TODO Correct timings
  if((instruction.code[0] & 0xC0) === 0xC0) { 
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
    cpu.reg.PC.setValue(op.address());
    if(op.name === 'HL') {
      return 4;
    } else if(op.name === 'IX') {
      return 8;
    }
    
    console.log(op);
    console.log('!!!!!!!!!! UNSUPPORTED JP');
  } else {
    cpu.reg.PC.setValue(op.address());
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

  cpu.reg.PC.setValue(instruction.operands[valOp].address());

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
      
      /*let signFlag = cpu.signFlag;
      let zeroFlag = cpu.zeroFlag;
      let parityFlag = cpu.parityFlag;
      let additionFlag = cpu.additionFlag;
      let carryFlag = cpu.carryFlag;
      let halfCarryFlag = cpu.halfCarryFlag;
      
      wReg.lo.setValue(add(cpu, wReg.lo.value(), 1, false));
      wReg.hi.setValue(add(cpu, wReg.hi.value(), 0, cpu.carryFlag));
      
      cpu.signFlag = signFlag;
      cpu.zeroFlag = zeroFlag;
      cpu.parityFlag = parityFlag;
      cpu.additionFlag = additionFlag;
      cpu.carryFlag = carryFlag;
      cpu.halfCarryFlag = halfCarryFlag;*/
      wReg.setValue((wReg.value() + 1) & 0xFFFF);
      
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
      
      wReg.setValue((wReg.value() - 1) & 0xFFFF);
      /*let signFlag = cpu.signFlag;
      let zeroFlag = cpu.zeroFlag;
      let parityFlag = cpu.parityFlag;
      let additionFlag = cpu.additionFlag;
      let carryFlag = cpu.carryFlag;
      let halfCarryFlag = cpu.halfCarryFlag;
      
      wReg.lo.setValue(sub(cpu, wReg.lo.value(), 1, false));
      wReg.hi.setValue(sub(cpu, wReg.hi.value(), 0, cpu.carryFlag));
      
      cpu.signFlag = signFlag;
      cpu.zeroFlag = zeroFlag;
      cpu.parityFlag = parityFlag;
      cpu.additionFlag = additionFlag;
      cpu.carryFlag = carryFlag;
      cpu.halfCarryFlag = halfCarryFlag;*/
      
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
  cpu.reg.SP.decr();
  cpu.bus().writeMemory(cpu.reg.SP.value(), cpu.reg.PC.hi.value());
  cpu.reg.SP.decr();
  cpu.bus().writeMemory(cpu.reg.SP.value(), cpu.reg.PC.lo.value());

  cpu.reg.PC.setValue(val.address());
  
  return 17;
}

operations[Operations.RST] = function RST(cpu, instruction) {
  let val = instruction.operands[0];
  cpu.reg.SP.decr();
  cpu.bus().writeMemory(cpu.reg.SP.value(), cpu.reg.PC.hi.value());
  cpu.reg.SP.decr();
  cpu.bus().writeMemory(cpu.reg.SP.value(), cpu.reg.PC.lo.value());

  cpu.reg.PC.lo.setValue(val.read());
  cpu.reg.PC.hi.setValue(0);
  
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

  cpu.reg.PC.lo.setValue(cpu.bus().readMemory(cpu.reg.SP.value()));
  cpu.reg.SP.incr();
  cpu.reg.PC.hi.setValue(cpu.bus().readMemory(cpu.reg.SP.value()));
  cpu.reg.SP.incr();

  return waitStates;
}

operations[Operations.PUSH] = function PUSH(cpu, instruction) {
  let op = instruction.operands[0];
  let reg = op.register;
  
  cpu.reg.SP.decr();
  cpu.bus().writeMemory(cpu.reg.SP.value(), reg.hi.value());
  
  cpu.reg.SP.decr();
  cpu.bus().writeMemory(cpu.reg.SP.value(), reg.lo.value());
  
  return 11;
}

operations[Operations.PUSH_FLAGS] = function PUSH_FLAGS(cpu, instruction) {
  cpu.writeFlags();
  return operations[Operations.PUSH](cpu, instruction);
}

operations[Operations.POP] = function POP(cpu, instruction) {
  let op = instruction.operands[0];
  let reg = op.register;
  
  reg.lo.setValue(cpu.bus().readMemory(cpu.reg.SP.value()));
  cpu.reg.SP.incr();
  reg.hi.setValue(cpu.bus().readMemory(cpu.reg.SP.value()));
  cpu.reg.SP.incr();
  
  return 10;
}

operations[Operations.POP_FLAGS] = function POP_FLAGS(cpu, instruction) {
  let waitstates = operations[Operations.POP](cpu, instruction);
  cpu.readFlags(cpu.reg.F.value());
  
  return waitstates;
}

operations[Operations.LDI] = function LDI(cpu, instruction) {
  let srcAdr = cpu.reg.HL.value();
  let dstAdr = cpu.reg.DE.value();
  
  cpu.bus().writeMemory(dstAdr, cpu.bus().readMemory(srcAdr));

  cpu.reg.HL.incr();
  cpu.reg.DE.incr();
  cpu.reg.BC.decr();
  
  cpu.parityFlag = cpu.reg.BC.value() !== 0;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;

  return 16;
}

operations[Operations.LDIR] = function LDIR(cpu, instruction) {
  let waitStates: number;
  
  waitStates = operations[Operations.LDI](cpu, instruction);
  
  if(cpu.parityFlag) {
    cpu.reg.PC.setValue(cpu.reg.PC.value() - 2);
    waitStates += 5;
  }
  
  return waitStates;
}

operations[Operations.LDD] = function LDD(cpu, instruction) {
  let srcAdr = cpu.reg.HL.value();
  let dstAdr = cpu.reg.DE.value();
  
  cpu.bus().writeMemory(dstAdr, cpu.bus().readMemory(srcAdr));

  cpu.reg.HL.decr();
  cpu.reg.DE.decr();
  cpu.reg.BC.decr();
  
  cpu.parityFlag = cpu.reg.BC.value() !== 0;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;
  
  return 16;
}

operations[Operations.LDDR] = function LDDR(cpu, instruction) {
  let waitStates: number;
  
  waitStates = operations[Operations.LDD](cpu, instruction);
  if(cpu.parityFlag) {
    cpu.reg.PC.setValue(cpu.reg.PC.value() - 2);
    waitStates += 5;
  }
  
  return waitStates;
}

function swapReg(reg1: Register, reg2: Register) {
  let val = reg1.value();
  reg1.setValue(reg2.value());
  reg2.setValue(val);
}

operations[Operations.EX] = function EX(cpu, instruction) {
  const op1 = instruction.operands[0];
  const op2 = instruction.operands[1];
  
  cpu.writeFlags();
  
  if(op1.type === OperandClass.Register && op2.type === OperandClass.Register) {
    swapReg(op1.register, op2.register);
  } else if(op1.type === OperandClass.Address && op2.type === OperandClass.Register) {
    let memH = cpu.bus().readMemory(op1.address()+1);
    let memL = cpu.bus().readMemory(op1.address());
    let reg = op2.register;
    
    cpu.bus().writeMemory(op1.address()+1, reg.hi.value());
    cpu.bus().writeMemory(op1.address(),   reg.lo.value());
    reg.hi.setValue(memH);
    reg.lo.setValue(memL);
  } else {
    console.log('Wtf?');
  }
  
  cpu.readFlags(cpu.reg.F.value());
  
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
  let oldVal = dstReg.value();
  
  let rh = instruction.operands[0];
  let rhVal: number = rh.read();
  
  dstReg.setValue(dstReg.value() & rhVal);
  
  cpu.zeroFlag = (dstReg.value() === 0);
  cpu.signFlag = (dstReg.value() & 0x80) !== 0;
  
  cpu.carryFlag = false;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = true;
  cpu.parityFlag = parity(dstReg.value());
  
  //TODO Correct timings
  return 4;
}

operations[Operations.XOR] = function XOR(cpu, instruction) {
  let dstReg = cpu.reg.A;
  let rh =  instruction.operands[0];

  dstReg.setValue(dstReg.value() ^ rh.read());
  
  cpu.zeroFlag = dstReg.value() === 0;
  cpu.signFlag = (dstReg.value() & 0x80) !== 0;
  
  cpu.carryFlag = false;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;
  cpu.parityFlag = parity(dstReg.value());
  
  //TODO Correct timings
  return 4;
}

operations[Operations.OR] = function OR(cpu, instruction) {
  let dstReg = cpu.reg.A;
  let oldVal = dstReg.value();
  
  let rh = instruction.operands[0];
  let rhVal: number = rh.read();
  let result = dstReg.value() | rhVal;
  
  dstReg.setValue(result);
  
  cpu.zeroFlag = result === 0;
  cpu.signFlag = (result & 0x80) !== 0;
  
  cpu.carryFlag = false;
  cpu.additionFlag = false;
  cpu.halfCarryFlag = false;
  cpu.parityFlag = parity(result);
  
  //TODO Correct timings
  return 4;
}

operations[Operations.ADD] = function ADD(cpu, instruction) {
  const dst = instruction.operands[0];
  const val = instruction.operands[1];
  
  if(dst.size === 1) {
    dst.write(add(cpu, dst.read(), val.read(), false)); 
  } else {
    const target = dst.register;
    const value = val.register;
    
    let signFlag = cpu.signFlag;
    let zeroFlag = cpu.zeroFlag;
    let parityFlag = cpu.parityFlag;
    
    target.lo.setValue(add(cpu, target.lo.value(), value.lo.value(), false));
    target.hi.setValue(add(cpu, target.hi.value(), value.hi.value(), cpu.carryFlag));
    
    cpu.signFlag = signFlag;
    cpu.zeroFlag = zeroFlag;
    cpu.parityFlag = parityFlag;
  }
  
  //TODO Correct timings
  return 4;
}

operations[Operations.ADC] = function ADC(cpu, instruction) {  
  const dst = instruction.operands[0];
  const val = instruction.operands[1];
  
  if(dst.size === 1) {
    dst.write(add(cpu, dst.read(), val.read(), cpu.carryFlag));
  } else {
    const target = dst.register;
    const value = val.register;
    
    /*let signFlag = cpu.signFlag;
    let zeroFlag = cpu.zeroFlag;
    let parityFlag = cpu.parityFlag;
    let additionFlag = cpu.additionFlag;*/
    
    target.lo.setValue(add(cpu, target.lo.value(), value.lo.value(), cpu.carryFlag));
    target.hi.setValue(add(cpu, target.hi.value(), value.hi.value(), cpu.carryFlag));
    
    cpu.zeroFlag = (target.value() === 0);
    
    /*if(dst.name === 'IX' || dst.name === 'IY') {
      cpu.signFlag = signFlag;
      cpu.zeroFlag = zeroFlag;
      cpu.parityFlag = parityFlag;
      cpu.additionFlag = additionFlag;
    }*/
  }
    
  //TODO Correct timings
  return 4;
}

operations[Operations.SUB] = function SUB(cpu, instruction) {
  const dst = instruction.operands[0];
  const val = instruction.operands[1];

  dst.write(sub(cpu, dst.read(), val.read(), false));
  
  //TODO Correct timings
  return 4;
}

operations[Operations.SBC] = function SBC(cpu, instruction) {
  const dst = instruction.operands[0];
  const val = instruction.operands[1];
  
  if(dst.size === 1) {
    dst.write(sub(cpu, dst.read(), val.read(), cpu.carryFlag));
  } else {
    const target = dst.register;
    const value = val.register;
    
    /*let signFlag = cpu.signFlag;
    let zeroFlag = cpu.zeroFlag;
    let parityFlag = cpu.parityFlag;
    let additionFlag = cpu.additionFlag;*/
    
    target.lo.setValue(sub(cpu, target.lo.value(), value.lo.value(), cpu.carryFlag));
    target.hi.setValue(sub(cpu, target.hi.value(), value.hi.value(), cpu.carryFlag));
    
    cpu.zeroFlag = (target.value() === 0);
    
    /*if(dst.name === 'IX' || dst.name === 'IY') {
      cpu.signFlag = signFlag;
      cpu.zeroFlag = zeroFlag;
      cpu.parityFlag = parityFlag;
      cpu.additionFlag = additionFlag;
    }*/
  }

  //TODO Correct timings
  return 4;
}

operations[Operations.DJNZ] = function DJNZ(cpu, instruction) {
  let val = instruction.operands[0];
  cpu.reg.B.setValue(cpu.reg.B.value() - 1);
  
  if(cpu.reg.B.value() === 0) { 
    return 8; 
  }
  
  cpu.reg.PC.setValue(val.address());
    
  return 13;
}

operations[Operations.CP] = function CP(cpu, instruction)  {
  let op = instruction.operands[0];
  let cmpVal = op.read();
  
  sub(cpu, cpu.reg.A.value(), cmpVal, false);
  
  //TODO Correct timings
  return 4;
}

operations[Operations.CPL] = function CPL(cpu, instruction) {
  cpu.reg.A.setValue(cpu.reg.A.value() ^ 0xFF);
  
  cpu.additionFlag = true;
  cpu.halfCarryFlag = true;

  return 4;
}

operations[Operations.RRCA] = function RRCA(cpu, instruction) {
  let signFlag = cpu.signFlag;
  let zeroFlag = cpu.zeroFlag;
  let parityFlag = cpu.parityFlag;
  
  operations[Operations.RRC](cpu, instruction);
  let carry = cpu.carryFlag;
  
  cpu.signFlag = signFlag;
  cpu.zeroFlag = zeroFlag;
  cpu.parityFlag = parityFlag;
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
    val = cpu.reg.A.value();
  }
  
  let carry: number;
  
  carry = val & 0x01;
  val = val >> 1;
  val |= carry << 7; 
  
  if(op) {
    op.write(val);
  } else {
    cpu.reg.A.setValue(val);
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
  let signFlag = cpu.signFlag;
  let zeroFlag = cpu.zeroFlag;
  let parityFlag = cpu.parityFlag;
      
  cpu.reg.A.setValue(RotateLeftCarry(cpu, cpu.reg.A.value()));
  
  let carry = cpu.carryFlag;
  
  cpu.signFlag = signFlag;
  cpu.zeroFlag = zeroFlag;
  cpu.parityFlag = parityFlag;
  cpu.carryFlag = carry;
  cpu.halfCarryFlag = false;
  cpu.additionFlag = false;
  
  return 4;
}

operations[Operations.RLA] = function RLA(cpu, instruction) {
  let signFlag = cpu.signFlag;
  let zeroFlag = cpu.zeroFlag;
  let parityFlag = cpu.parityFlag;
 
  operations[Operations.RL](cpu, instruction);
  let carry = cpu.carryFlag;
  
  cpu.signFlag = signFlag;
  cpu.zeroFlag = zeroFlag;
  cpu.parityFlag = parityFlag;
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
    val = cpu.reg.A.value();
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
    cpu.reg.A.setValue(val);
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
  let signFlag = cpu.signFlag;
  let zeroFlag = cpu.zeroFlag;
  let parityFlag = cpu.parityFlag;
   
  operations[Operations.RR](cpu, instruction);

  cpu.signFlag = signFlag;
  cpu.zeroFlag = zeroFlag;
  cpu.parityFlag = parityFlag;
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
    val = cpu.reg.A.value();
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
    cpu.reg.A.setValue(val);
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
  
  return 4;
}

operations[Operations.CCF] = function CCF(cpu, instruction) {
  cpu.halfCarryFlag = !cpu.halfCarryFlag;
  cpu.carryFlag = !cpu.carryFlag;
  cpu.additionFlag = false;
  
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
  let regVal = cpu.reg.A.value();

  if((regVal & 0xF) > 9 || cpu.halfCarryFlag) {
    regVal = (regVal + 0x6) & 0xFF; 
    cpu.halfCarryFlag = true;
  } else {
    cpu.halfCarryFlag = false;
  }
  
  if(((regVal & 0xF0) >> 4) > 9 || cpu.carryFlag) {
    regVal = (regVal + 0x60) & 0xFF;
    cpu.carryFlag = true;
  } else {
    cpu.carryFlag = false;
  }
  
  cpu.parityFlag = parity(regVal);
  cpu.zeroFlag = regVal === 0;
  cpu.signFlag = (regVal & 0x80) !== 0;
  
  cpu.reg.A.setValue(regVal);
  
  //TODO Correct timings
  return 4;
}

operations[Operations.CPD] = function CPD(cpu, instruction) {
  let carryBit: boolean = cpu.carryFlag;
  sub(cpu, cpu.reg.A.value(), cpu.bus().readMemory(cpu.reg.HL.value()), false);
  
  cpu.reg.HL.decr();
  cpu.reg.BC.decr();
  
  cpu.carryFlag = carryBit;
  cpu.parityFlag = cpu.reg.BC.value() !== 0;
  
  //TODO Correct timings
  return 4; 
}

operations[Operations.CPDR] = function CPDR(cpu, instruction) {
  operations[Operations.CPD](cpu, instruction);
  if(cpu.reg.BC.value() !== 0 && !cpu.zeroFlag) {
    cpu.reg.PC.setValue(cpu.reg.PC.value() - 2);
  }
  
  //TODO Correct timings
  return 4; 
}

operations[Operations.CPI] = function CPI(cpu, instruction) {
  let carryBit: boolean = cpu.carryFlag;
  sub(cpu, cpu.reg.A.value(), cpu.bus().readMemory(cpu.reg.HL.value()), false);
  
  cpu.reg.HL.incr();
  cpu.reg.BC.decr();
  
  cpu.carryFlag = carryBit;
  cpu.parityFlag = cpu.reg.BC.value() !== 0;
  
  //TODO Correct timings
  return 4; 
}

operations[Operations.CPIR] = function CPIR(cpu, instruction) {
  operations[Operations.CPI](cpu, instruction);
  if(cpu.reg.BC.value() !== 0 && !cpu.zeroFlag) {
    cpu.reg.PC.setValue(cpu.reg.PC.value() - 2);
  }
  
  //TODO Correct timings
  return 4; 
}

operations[Operations.NEG] = function NEG(cpu, instruction) {
  let val = cpu.reg.A.value();
  
  cpu.reg.A.setValue(sub(cpu, 0, val, false));

  return 8;
}

operations[Operations.RRD] = function RRD(cpu, instruction) {
  //TODO Correct timings
  return 4; 
}

operations[Operations.RLD] = function RLD(cpu, instruction) {
  //TODO Correct timings
  return 4; 
}

operations[Operations.SLL] = function SLL(cpu, instruction) {
  //TODO Correct timings
  return 4;
}