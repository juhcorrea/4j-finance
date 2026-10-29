'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const tools=require('../public/ferramentas-core.js');
test('money supports Brazilian cents and grouping without floating point sums',()=>{
  assert.equal(tools.money('1.250,50','valor'),125050);
  assert.equal(tools.money('1.000','valor'),100000);
  assert.equal(tools.money('0,01','valor'),1);
  assert.equal(tools.money('1234.56','valor'),123456);
  assert.equal(tools.money(' 0 ','valor'),0);
});
test('missing, negative, ambiguous and nonfinite inputs never become free money',()=>{
  for(const input of ['',null,undefined,'-10','NaN','Infinity','1e4','1,000','1.000.00','1,2,3','1 000','99999999999999999999']){
    assert.throws(()=>tools.money(input,'valor'));
  }
});
test('monthly plan keeps reserved goals distinct and reports negative difference',()=>{
  assert.equal(tools.budget({income:'3.000',bills:'1.650',daily:'850',goals:'300'}).margin,20000);
  assert.equal(tools.budget({income:'3.000',bills:'1.650',daily:'1.100',goals:'300'}).margin,-5000);
  assert.equal(tools.budget({income:'0,30',bills:'0,10',daily:'0,20',goals:'0'}).margin,0);
  assert.throws(()=>tools.budget({income:'3000',bills:'1650',daily:'850',goals:''}));
});
test('goal rounds up contribution count with an exact smaller final contribution',()=>{
  const result=tools.goal({target:'1200',saved:'250',monthly:'150'});
  assert.equal(result.months,7);assert.equal(result.remaining,95000);assert.equal(result.finalContribution,5000);
  const cents=tools.goal({target:'0,07',saved:'0,01',monthly:'0,02'});
  assert.equal(cents.months,3);assert.equal(cents.finalContribution,2);
});
test('already funded goal needs no contribution while unfunded zero monthly is rejected',()=>{
  assert.equal(tools.goal({target:'100',saved:'150',monthly:'0'}).months,0);
  assert.equal(tools.goal({target:'100',saved:'0',monthly:'200'}).finalContribution,10000);
  assert.throws(()=>tools.goal({target:'100',saved:'0',monthly:'0'}));
  assert.throws(()=>tools.goal({target:'0',saved:'0',monthly:'100'}));
});
test('installment total includes entry and percentage uses cash price as denominator',()=>{
  const result=tools.installments({cash:'960',down:'0',payment:'180',installments:'6'});
  assert.equal(result.total,108000);assert.equal(result.difference,12000);assert.equal(result.differencePercent,12.5);
  const withEntry=tools.installments({cash:'900',down:'100',payment:'90',installments:'10'});
  assert.equal(withEntry.total,100000);assert.equal(withEntry.difference,10000);
});
test('equal and cheaper installment offers remain factual comparisons',()=>{
  assert.equal(tools.installments({cash:'1000',down:'100',payment:'90',installments:'10'}).difference,0);
  assert.equal(tools.installments({cash:'1000',down:'0',payment:'90',installments:'10'}).difference,-10000);
});
test('installment count requires positive bounded integers and meaningful prices',()=>{
  for(const installments of ['',0,-1,1.5,'1e2',361])assert.throws(()=>tools.installments({cash:'100',down:'0',payment:'10',installments}));
  for(const pair of [{cash:'0',payment:'10'},{cash:'100',payment:'0'}])assert.throws(()=>tools.installments({...pair,down:'0',installments:'10'}));
});
