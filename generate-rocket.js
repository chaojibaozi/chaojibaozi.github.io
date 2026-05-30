const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// 创建 40x40 画布
const canvas = createCanvas(40, 40);
const ctx = canvas.getContext('2d');

// 清空画布为白色
ctx.fillStyle = '#FFFFFF';
ctx.fillRect(0, 0, 40, 40);

// 绘制火焰
// 外层火焰 (橙色)
ctx.fillStyle = '#FF8C00';
ctx.beginPath();
ctx.moveTo(16, 32);
ctx.lineTo(12, 40);
ctx.lineTo(20, 36);
ctx.lineTo(28, 40);
ctx.lineTo(24, 32);
ctx.closePath();
ctx.fill();

// 内层火焰 (黄色)
ctx.fillStyle = '#FFD700';
ctx.beginPath();
ctx.moveTo(18, 32);
ctx.lineTo(16, 38);
ctx.lineTo(20, 35);
ctx.lineTo(24, 38);
ctx.lineTo(22, 32);
ctx.closePath();
ctx.fill();

// 绘制火箭主体 (白色)
ctx.fillStyle = '#FFFFFF';
ctx.beginPath();
ctx.moveTo(20, 4);
ctx.lineTo(28, 20);
ctx.lineTo(28, 32);
ctx.lineTo(12, 32);
ctx.lineTo(12, 20);
ctx.closePath();
ctx.fill();

// 火箭边框 (灰色)
ctx.strokeStyle = '#666666';
ctx.lineWidth = 1;
ctx.stroke();

// 绘制火箭头部红色尖端
ctx.fillStyle = '#FF4444';
ctx.beginPath();
ctx.moveTo(20, 4);
ctx.lineTo(15, 14);
ctx.lineTo(25, 14);
ctx.closePath();
ctx.fill();

// 绘制窗户
ctx.fillStyle = '#87CEEB';
ctx.beginPath();
ctx.arc(20, 20, 4, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = '#333333';
ctx.lineWidth = 1;
ctx.stroke();

// 绘制尾翼
ctx.fillStyle = '#CC0000';
// 左尾翼
ctx.beginPath();
ctx.moveTo(12, 28);
ctx.lineTo(8, 32);
ctx.lineTo(12, 32);
ctx.closePath();
ctx.fill();
// 右尾翼
ctx.beginPath();
ctx.moveTo(28, 28);
ctx.lineTo(32, 32);
ctx.lineTo(28, 32);
ctx.closePath();
ctx.fill();

// 保存为 PNG
const buffer = canvas.toBuffer('image/png');
const outputPath = path.join(__dirname, 'rocket-icon.png');
fs.writeFileSync(outputPath, buffer);

console.log('火箭图标已保存到:', outputPath);
