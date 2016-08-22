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

import chai = require('chai');
import {Z80Cpu} from '../hardware/arch/z80';
import {Operations, operations} from '../hardware/arch/z80-operations';
import {Instruction} from '../hardware/arch/instruction';
import {Operand} from '../hardware/arch/instruction';

import {Ram} from '../hardware/ram';

require('source-map-support').install();

chai.should();

let cpu: Z80Cpu;
const ram: Ram = new Ram(1000);

function runInstruction(operation: Operations, op1?: Operand, op2?: Operand) {
  let instruction = new Instruction(cpu);
  instruction.opcode = operation;
  instruction.operands = [];
  if(op1 !== undefined) { instruction.operands.push(op1); }
  if(op2 !== undefined) { instruction.operands.push(op2); }
  
  return operations[name](cpu, instruction);
}

/*describe.skip("Instructions", () => {
  beforeEach(() => {
    cpu = new Z80Cpu();
    cpu.attachBus(ram);
  });
  
  describe("LD", () => {
    const registers = ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'W', 'Z'];
    
    registers.forEach(function(register) {
      it('Should move byte to register ' + register, () => {
        runInstruction(Operations.LD, register, new Uint8Array([0x42]));
        cpu.reg[register].uint.should.equal(0x42);
      });
      
      it('Should read memory into register ' + register, () => {
        ram.writeMemory(0x100, 80);
        runInstruction(Operations.LD, register, [new Uint16Array([0x100])]);
        
        cpu.reg[register].uint.should.equal(80);
      });
    });
    
    it('Should write word', () => {
      runInstruction(Operations.LD, 'BC', new Uint16Array([0xED40]));
      cpu.reg.BC.value().should.equal(0xED40);
      cpu.reg.B.value().should.equal(0xED);
      cpu.reg.C.value().should.equal(0x40);
    });
    
    it('Should write memory', () => {
      runInstruction(Operations.LD, [new Uint16Array([0x100])], new Uint8Array([50]));
      
      ram.readMemory(0x100).should.equal(50);
    });
    
    it('Should read with displacement', () => {
      ram.writeMemory(0x100 + 5, 40);
      runInstruction(Operations.LD, 'A', [new Uint16Array([0x100]), new Uint8Array([5])]);
      
      cpu.reg.A.value().should.equal(40);
    });
  });
  
  describe('ADD', () => {
    it('Should add without CF and OF', () => {
      cpu.reg.A.setValue(5);
      runInstruction(Operations.ADD, 'A', new Buffer([5]));
      
      cpu.reg.A.value().should.equal(10);
      cpu.carryFlag.should.be.false;
      cpu.halfCarryFlag.should.be.false;
      cpu.parityFlag.should.be.false;
      cpu.signFlag.should.be.false;
      cpu.additionFlag.should.be.false;
      cpu.zeroFlag.should.be.false;
    });
    
    it('Should add with Half-Carry', () => {
      cpu.reg.A.setValue(6);
      runInstruction(Operations.ADD, 'A', new Buffer([10]));
      
      cpu.reg.A.value().should.equal(16);
      cpu.carryFlag.should.be.false;
      cpu.halfCarryFlag.should.be.true;
      cpu.parityFlag.should.be.false;
      cpu.signFlag.should.be.false;
      cpu.additionFlag.should.be.false;
      cpu.zeroFlag.should.be.false;
    });
    
    it('Should add with Carry', () => {
      cpu.reg.A.setValue(0xFF);
      runInstruction(Operations.ADD, 'A', new Buffer([0xFF]));
      
      cpu.reg.A.value().should.equal(0xFE);
      cpu.carryFlag.should.be.true;
      cpu.halfCarryFlag.should.be.true;
      cpu.parityFlag.should.be.false;
      cpu.signFlag.should.be.true;
      cpu.additionFlag.should.be.false;
      cpu.zeroFlag.should.be.false;
    });
    
    it('Should add 16-Bit registers', function() {
      cpu.reg.HL.setValue(0xA0);
      cpu.reg.BC.setValue(0xE3);
      runInstruction(Operations.ADD, 'HL', 'BC');
      
      cpu.reg.HL.value().should.equal(0x183);
      
      cpu.carryFlag.should.be.false;
      cpu.halfCarryFlag.should.be.false;
      cpu.parityFlag.should.be.false;
      cpu.signFlag.should.be.false;
      cpu.additionFlag.should.be.false;
      cpu.zeroFlag.should.be.false;
    });
  });
  
  describe('SUB', () => {
    const testData = [
      [0,   0,    false,  0,    false,  false],
      [0,   1,    false,  255,  true,   false],
      [0,   127,  false,  129,  true,   false],
      [0,   128,  false,  128,  true,   true],
      [0,   129,  false,  127,  true,   false],
      [0,   255,  false,  1,    true,   false],
      [1,   0,    false,  1,    false,  false],
      [1,   1,    false,  0,    false,  false],
      [1,   127,  false,  130,  true,   false],
      [1,   128,  false,  129,  true,   true],
      [1,   129,  false,  128,  true,   true],
      [1,   255,  false,  2,    true,   false],
      [127, 0,    false,  127,  false,  false],
      [127, 1,    false,  126,  false,  false],
      [127, 127,  false,  0,    false,  false],
      [127, 128,  false,  255,  true,   true],
      [127, 129,  false,  254,  true,   true],
      [127, 255,  false,  128,  true,   true]
    ];
    
    testData.forEach(function(test) {
      it(test[0] + ' - ' + test[1] + ' = ' + test[3], () => {
        cpu.reg.A.setValue(<number>test[0]);
        runInstruction(Operations.SUB, new Buffer([test[1]]));
        
        cpu.reg.A.value().should.equal(test[3]);
        cpu.carryFlag.should.equal(test[4]);
        cpu.parityFlag.should.equal(test[5]);
      });
    });
  });
  
  describe('ADC', () => {
    it('Should add with carry', () => {
      cpu.carryFlag = true;
      cpu.reg.A.setValue(1);
      
      runInstruction(Operations.ADC, 'A', new Buffer([1]));
      
      cpu.reg.A.value().should.equal(3);
    });
  });
  
  describe('SET', () => {
    it('Should set bit 1 to 8', () => {
      let cmp = 0;
      
      for(let i=0; i < 8; i++) {
        cmp |= 0x1 << i;
        
        runInstruction(Operations.SET, i, 'A');
        cpu.reg.A.value().should.equal(cmp);
      }
    });
  });
  
  describe('RES', function() {       
    for(let i=0; i < 8; i++) {
      (function(bit: number) {
        it('Should reset bit ' + bit, function() {
          let cmp: number = 0xFF & (~(0x1 << bit));
          cpu.reg.A.setValue(0xFF);
          
          runInstruction(Operations.RES,  bit, 'A');
          cpu.reg.A.value().should.equal(cmp);
        });
      })(i);        
    }
  });
  
  describe('BIT', () => {
    it('Should give false for bit 1 to 8', () => {
      for(let i=0; i < 8; i++) {
        runInstruction(Operations.BIT, i, 'A');
        cpu.zeroFlag.should.be.true;
      }
    });
    
    it('Should give true for bit 1 to 8', () => {
      cpu.reg.A.setValue(0xFF);
       
      for(let i=0; i < 8; i++) {
        runInstruction(Operations.BIT, i, 'A');
        cpu.zeroFlag.should.be.false;
      }
    });
  });
  
  describe('DAA', function() {
    it('Should correct BCD', function() {
      cpu.reg.A.setValue(0x11);
      runInstruction(Operations.ADD, 'A', new Buffer([0x19]));
      cpu.reg.A.value().should.equal(0x2A);
      
      runInstruction(Operations.DAA);
      cpu.reg.A.value().should.equal(0x30);
      
      cpu.carryFlag.should.be.false;
    });
    
    it('Should correct BCD with carry', function() {
      cpu.reg.A.setValue(0x99);
      runInstruction(Operations.ADD, 'A', new Buffer([0x1]));
      cpu.reg.A.value().should.equal(0x9A);
      
      runInstruction(Operations.DAA);
      cpu.reg.A.value().should.equal(0x0);
      
      cpu.carryFlag.should.be.true;
    });
  });
  
  describe('RR', function() {
    it('Should rotate into carry', function() {
      cpu.reg.A.setValue(0x81);
      runInstruction(Operations.RR, 'A');
      
      cpu.reg.A.value().should.equal(0x40);
      cpu.carryFlag.should.be.true;
    });
    
    it('Should rotate from carry', function() {
      cpu.carryFlag = true;
      cpu.reg.A.setValue(0x80);
      runInstruction(Operations.RR, 'A');
      
      cpu.reg.A.value().should.equal(0xC0);
      cpu.carryFlag.should.be.false;
    });
    
    const roundtripTest = [
      { reg: 0x80, c: false },
      { reg: 0x40, c: false },
      { reg: 0x20, c: false },
      { reg: 0x10, c: false },
      { reg: 0x8, c: false },
      { reg: 0x4, c: false },
      { reg: 0x2, c: false },
      { reg: 0x1, c: false },
      { reg: 0x0, c: true }
    ]
    
    it('Should make a complete roundtrip', function() {
      cpu.carryFlag = true;
      
      roundtripTest.forEach(function(test) {
        runInstruction(Operations.RR, 'A');
        cpu.reg.A.value().should.equal(test.reg);
        cpu.carryFlag.should.equal(test.c);
      });
    });
  });
  
  describe('RRC', function() {
    it('Should set carry', function() {
      cpu.reg.A.setValue(0x81);
      runInstruction(Operations.RRC, 'A');
      
      cpu.reg.A.value().should.equal(0xC0);
      cpu.carryFlag.should.be.true;
    });
    
    it('Should reset carry', function() {
      cpu.carryFlag = true;
      cpu.reg.A.setValue(0x80);
      runInstruction(Operations.RRC, 'A');
      
      cpu.reg.A.value().should.equal(0x40);
      cpu.carryFlag.should.be.false;
    });
  });
  
  describe('CP', function() {
    it('Should be equal', function() {
      cpu.reg.A.setValue(10);
      runInstruction(Operations.CP, new Buffer([10]));
      
      cpu.signFlag.should.be.false;
      cpu.carryFlag.should.be.false;
      cpu.additionFlag.should.be.true;
      cpu.zeroFlag.should.be.true;
      cpu.parityFlag.should.be.false;
    });
    
    it('Register A should be greater', function() {
      cpu.reg.A.setValue(10);
      runInstruction(Operations.CP, new Buffer([5]));
      
      cpu.signFlag.should.be.false;
      cpu.carryFlag.should.be.false;
      cpu.additionFlag.should.be.true;
      cpu.zeroFlag.should.be.false;
      cpu.parityFlag.should.be.false;
    });
    
    it('Register A should be smaller', function() {
      cpu.reg.A.setValue(10);
      runInstruction(Operations.CP, new Buffer([15]));
      
      cpu.signFlag.should.be.true;
      cpu.carryFlag.should.be.true;
      cpu.additionFlag.should.be.true;
      cpu.zeroFlag.should.be.false;
      cpu.parityFlag.should.be.false;
    });
    
    it('Should be smaller (unsigned)', function() {
      cpu.reg.A.setValue(0xab);
      cpu.reg.B.setValue(0xac);
      
      runInstruction(Operations.CP, 'B');
      
      cpu.carryFlag.should.be.true;
      cpu.additionFlag.should.be.true;
      cpu.zeroFlag.should.be.false;
      cpu.parityFlag.should.be.false;;
    });
  });
  
  describe('SRA', function() {
    it('Should shift into carry', function() {
      cpu.reg.A.setValue(0x81);
      runInstruction(Operations.SRA, 'A');
      (cpu.reg.A.value() & 0x80).should.be.above(0);
      cpu.carryFlag.should.be.true;
    });
    
    it('Should not set HSB', function() {
      cpu.reg.A.setValue(0x41);
      runInstruction(Operations.SRA, 'A');
      (cpu.reg.A.value() & 0x80).should.equal(0);
      cpu.carryFlag.should.be.true;
    });
  });
  
  describe('SRL', function() {
    it('Should shift into carry', function() {
      cpu.reg.A.setValue(0x81);
      runInstruction(Operations.SRL, 'A');
      cpu.reg.A.value().should.equal(0x40);
      cpu.carryFlag.should.be.true;
    });
    
    it('Should not shift into carry', function() {
      cpu.reg.A.setValue(0x80);
      runInstruction(Operations.SRL, 'A');
      cpu.reg.A.value().should.equal(0x40);
      cpu.carryFlag.should.be.false;
    });
  });
});*/