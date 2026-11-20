const fs = require('fs');
const readline = require('readline');

async function getBoundingBoxes() {
  const fileStream = fs.createReadStream('Controller.obj');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const allVerts = [];
  const objects = [];
  let currentObj = null;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/).slice(1).map(Number);
      allVerts.push(parts);
    } else if (trimmed.startsWith('o ')) {
      const name = trimmed.substring(2).trim();
      currentObj = {
        name,
        vertIndices: new Set(),
      };
      objects.push(currentObj);
    } else if (trimmed.startsWith('f ') && currentObj) {
      const tokens = trimmed.split(/\s+/).slice(1);
      for (const token of tokens) {
        const vIdx = parseInt(token.split('/')[0], 10);
        // OBJ 1-based indexing
        currentObj.vertIndices.add(vIdx - 1);
      }
    }
  }

  console.log('Total vertices:', allVerts.length);
  const overallMin = [Infinity, Infinity, Infinity];
  const overallMax = [-Infinity, -Infinity, -Infinity];

  const results = objects.map(obj => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const idx of obj.vertIndices) {
      const v = allVerts[idx];
      if (!v) continue;
      for (let i = 0; i < 3; i++) {
        if (v[i] < min[i]) min[i] = v[i];
        if (v[i] > max[i]) max[i] = v[i];
        if (v[i] < overallMin[i]) overallMin[i] = v[i];
        if (v[i] > overallMax[i]) overallMax[i] = v[i];
      }
    }
    const center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    ];
    const size = [
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2]
    ];
    return { name: obj.name, center, size, count: obj.vertIndices.size };
  });

  const overallCenter = [
    (overallMin[0] + overallMax[0]) / 2,
    (overallMin[1] + overallMax[1]) / 2,
    (overallMin[2] + overallMax[2]) / 2
  ];
  const overallSize = [
    overallMax[0] - overallMin[0],
    overallMax[1] - overallMin[1],
    overallMax[2] - overallMin[2]
  ];

  console.log('Overall Center:', overallCenter.map(n => n.toFixed(3)));
  console.log('Overall Size:', overallSize.map(n => n.toFixed(3)));
  console.log('\nPer-object relative center from overall center:');
  results.forEach(r => {
    const relCenter = [
      r.center[0] - overallCenter[0],
      r.center[1] - overallCenter[1],
      r.center[2] - overallCenter[2]
    ];
    console.log(`'${r.name}': { relX: ${relCenter[0].toFixed(2)}, relY: ${relCenter[1].toFixed(2)}, relZ: ${relCenter[2].toFixed(2)}, size: [${r.size.map(n => n.toFixed(2)).join(', ')}] },`);
  });
}

getBoundingBoxes().catch(console.error);
