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
import {Ram} from '../hardware/ram';
import {IoPort} from '../hardware/io-port';
import {IoBus} from '../hardware/io-bus';
import {add, sub, parity} from '../hardware/arch/z80-operations';

import fs = require('fs');
require('source-map-support').install();

chai.should();

let cpu: Z80Cpu;
const ram: Ram = new Ram(1000);
  
describe('Arithmetic Logic Unic', () => {
  beforeEach(() => {
    cpu = new Z80Cpu();
    cpu.attachBus(ram);
  });
  
  describe('Parity Check', () => {
    const testData = [
      [0x0, true],
      [0x1, false],
      [0x4, false],
      [0x8, false],
      [0x10, false],
      [0x20, false],
      [0x40, false],
      [0x80, false],
      [0x88, true],
      [0xA8, false],
      [0x14, true],
      [0xD7, true]
    ];
    
    testData.forEach(function(test) {
      it(test[0] + ' = ' + test[1], () => {
        parity(<number>test[0]).should.equal(test[1]);
      });
    });
  });
  
  describe('Subtraction', () => {
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
      [127, 255,  false,  128,  true,   true],
      [128, 0,    false,  128,  false,  false],
      [128, 1,    false,  127,  false,  true],
      [128, 127,  false,  1,    false,  true],
      [128, 128,  false,  0,    false,  false],
      [128, 129,  false,  255,  true,   false],
      [129, 0,    false,  129,  false,  false],
      [129, 127,  false,  2,    false,  true],
      [129, 128,  false,  1,    false,  false],
      [129, 129,  false,  0,    false,  false],
      [129, 255,  false,  130,  true,   false],
      [255, 0,    false,  255,  false,  false],
      [255, 1,    false,  254,  false,  false],
      [255, 127,  false,  128,  false,  false],
      [255, 128,  false,  127,  false,  false],
      [255, 129,  false,  126,  false,  false],
      [255, 255,  false,  0,    false,  false]
      
    ];
    
    testData.forEach(function(test) {
      it(test[0] + ' - ' + test[1] + ' = ' + test[3], () => {
        let result = sub(cpu, <number>test[0], <number>test[1], <boolean>test[2]);
        
        result.should.equal(test[3]);
        cpu.carryFlag.should.equal(test[4]);
        cpu.parityFlag.should.equal(test[5]);
      });
    });
  });  
});
