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
import {Cpu} from '../cpu';
import {IoLink} from '../cpu';
import {IoPort} from '../io-port';
import {IoBus} from '../io-bus';
import {Ram} from '../ram';
import {Rom} from '../rom';
import {Bus} from '../bus';

import {Register} from './z80-register';
import {Registers} from './z80-register';

//import {InstructionDecoder} from './z80-decoder';
import {Instruction} from './instruction';
import {add} from './z80-operations';
import {sub} from './z80-operations';
import {parity} from './z80-operations';

import EventEmitter = require('eventemitter3');
import winston = require('winston');

const InstructionLog = new (winston.Logger)({
  transports: [
    new (winston.transports.File)({ filename: 'instructions.log', json: false, timestamp: false })
  ]
});

const enum CPUState {
  Execute = 0,
  CheckInterrupt = 1
};

export class Z80Cpu 
  extends EventEmitter
  implements Cpu
  
{
  private memoryBus: Bus = null;
  private io: IoBus = null;
  public reg = new Registers;
  //private decoder: InstructionDecoder = new InstructionDecoder;
  private instruction: Instruction = null;

  private interruptFlag1: boolean = false;
  private interruptFlag2: boolean = false;
  private interruptAknowleged: boolean = false;
  private interruptMode: number = 0;
  private interruptRequest: boolean = false;
  
  public carryFlag: boolean = false;
  public zeroFlag: boolean = false;
  public parityFlag: boolean = false;
  public signFlag: boolean = false;
  public additionFlag: boolean = false;
  public halfCarryFlag: boolean = false;
  
  public constructor() {
    super();
  }
  
  set interrupt(val: boolean) {
    this.interruptRequest = val;
  }

  get iff1(): boolean {
    return this.interruptFlag1;
  }
  
  set iff1(val: boolean) {
    this.interruptFlag1 = val;
  }
  
  get iff2(): boolean {
    return this.interruptFlag2;
  }
  
  set iff2(val: boolean) {
    this.interruptFlag2 = true;
  }
  
  get im(): number {
    return this.interruptMode;
  }
  
  set im(val: number) {
    this.interruptMode = val;
  }
  
  public readFlags(val: number) {
    this.carryFlag = (val & 0x1) !== 0;
    this.additionFlag = (val & 0x2) !== 0;
    this.parityFlag = (val & 0x4) !== 0;
    this.halfCarryFlag = (val & 0x10) !== 0;
    this.zeroFlag = (val & 0x40) !== 0;
    this.signFlag = (val & 0x80) !== 0;
  }
  
  public writeFlags() {
    this.reg.F.setValue(
      (this.carryFlag ? 0x1 : 0x0) |
      (this.additionFlag ? 0x2 : 0x0) |
      (this.parityFlag ? 0x4 : 0x0) |
      (this.halfCarryFlag ? 0x10 : 0x0) |
      (this.zeroFlag ? 0x40 : 0x0) |
      (this.signFlag ? 0x80 : 0x0)
    );
  }
  
  public attachBus(bus: Bus) {
    this.memoryBus = bus;
    this.instruction = new Instruction(this);
  }

  public bus(): Bus {
    return this.memoryBus;
  }

  attachIoBus(ioBus:IoBus) {
    this.io = ioBus;
  }

  ioBus(): IoBus {
    return this.io;
  }
 
  private handleInterrupt(): boolean {
    if(this.interruptMode !== 1) { return false; }

    this.interruptFlag1 = false;
    this.interruptFlag2 = false;
  
    this.reg.SP.setValue(this.reg.SP.value() - 1);
    this.bus().writeMemory(this.reg.SP.value(), this.reg.PC.hi.value());
    this.reg.SP.setValue(this.reg.SP.value() - 1);
    this.bus().writeMemory(this.reg.SP.value(), this.reg.PC.lo.value());

    this.reg.PC.setValue(0x0038);

    this.emit('INTACK');
    
    return true;
  }
  
  private cpuState: CPUState = CPUState.Execute;
  private stateExec = [
    Z80Cpu.performExecute,
    Z80Cpu.performInterruptCheck
  ];
  
  private static performFetch(cpu: Z80Cpu): void {
    let offset = cpu.reg.PC.value();
    
    if(cpu.instruction.address !== offset) {
      cpu.instruction.address = offset;
      cpu.instruction.decode();
    }
    
    cpu.reg.PC.setValue(offset + cpu.instruction.size);
    
    //InstructionLog.info(this.instruction.address.toString(16).toUpperCase() + ' ' + this.instruction.toString());

  }
  
  private static performExecute(cpu: Z80Cpu): number {
    let waitStates: number = 0;
    
    Z80Cpu.performFetch(cpu);
    
    if(!cpu.instruction.operation) {
      console.error('Opcode not implemented!');
      console.error(' > ' + cpu.instruction.toString());
      process.exit(-1);
    }

    waitStates = cpu.instruction.operation(cpu, cpu.instruction);
   
    /*InstructionLog.info('A: ' + this.reg.A.value().toString(16) + 
                ' F: ' + this.reg.F.value().toString(16) +
                ' B: ' + this.reg.B.value().toString(16) +
                ' C: ' + this.reg.C.value().toString(16) +
                ' D: ' + this.reg.D.value().toString(16) +
                ' E: ' + this.reg.E.value().toString(16) +
                ' H: ' + this.reg.H.value().toString(16) +
                ' L: ' + this.reg.L.value().toString(16) +
                ' SP: ' + this.reg.SP.value().toString(16)); */
    
    if(cpu.interruptFlag1 === true && cpu.interruptRequest) {
      cpu.cpuState = CPUState.CheckInterrupt;
    }

    return waitStates;
  }
  
  private static performInterruptCheck(cpu: Z80Cpu): number {
    cpu.cpuState = CPUState.Execute;
    
    if(cpu.handleInterrupt()) { return 6; }

    return 0;
  }

  public tick(cycles: number): number {
    switch(this.cpuState) {
      case CPUState.Execute:
        return Z80Cpu.performExecute(this);
      
      case CPUState.CheckInterrupt:
        return Z80Cpu.performInterruptCheck(this);
    }
  }
}
