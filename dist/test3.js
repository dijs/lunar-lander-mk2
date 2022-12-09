// Learn to paint a specifc photo

const monaLisaCanvas = document.createElement('canvas');
const monaLisaContext = monaLisaCanvas.getContext('2d');
const monaLisaImage = document.querySelector('#mona');

const width = 16;
const height = 25;

// const width = 33;
// const height = 50;

// const width = 67;
// const height = 100;

monaLisaContext.drawImage(monaLisaImage, 0, 0, 540, 805, 0, 0, width, height);

const monaLisaPixels = monaLisaContext.getImageData(0, 0, width, height).data;

const canvas = document.querySelector('#bot');
const ctx = canvas.getContext('2d');

// ctx.fillStyle = 'black';
// ctx.fillRect(0, 0, width, height);

let data = [
  [], // x-values (timestamps)
  [], // y-values (series 1)
];

const ai = new Evolution({
  inputs: 16,
  outputs: width * height,
  generationSize: 10,
  topSize: 5,
  task: 'regression',
  hiddenUnits: 8,
  learningRate: 0.01,
});

// * Lower hidden units seems to help a lot

// ai.createRandomGeneration();

// Random inputs
const input = [
  0.918898482489402, 0.929091503167295, 0.8804656153118628, 0.7332665580499627,
  0.9914229694343437, 0.6105170073866089, 0.8257288573767416,
  0.34949840154284106, 0.33085273143805627, 0.8898168718468946,
  0.8609078429251809, 0.5740397783723075, 0.17921285491492345,
  0.6122999357381669, 0.6722567217767064, 0.9544760906103955,
];

// Array(ai.config.inputs)
//   .fill(0)
//   .map(() => Math.random());

const colorMap = {};

function getColor(n) {
  if (colorMap[n]) return colorMap[n];
  const hex = n.toString(16);
  const code = '#' + hex + hex + hex;
  colorMap[n] = code;
  return code;
}

function render(id) {
  const pixels = ai.getAction(id, input);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = Math.floor(pixels[y * width + x] * 256);
      ctx.fillStyle = getColor(px);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

const threshold = 0.1;
const size = width * height;

function fitness() {
  let misses = 0;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 256;
    const g = pixels[i + 1] / 256;
    const b = pixels[i + 2] / 256;

    const x = monaLisaPixels[i] / 256;
    const y = monaLisaPixels[i + 1] / 256;
    const z = monaLisaPixels[i + 2] / 256;

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lim = 0.2126 * x + 0.7152 * y + 0.0722 * z;

    const delta = Math.abs(lim - lum);

    if (delta > threshold) {
      misses++;
    }
  }
  return 100 - (misses / size) * 100;
}

function train() {
  let topScore = 0;

  for (let id of ai.getNodeKeys()) {
    render(id);
    const score = fitness();
    ai.setScore(id, score);
    if (score > topScore) {
      topScore = score;
    }
  }

  // data[0].push(ai.generatin);
  // data[1].push(topScore);
  // uplot.setData(data);

  window.topScore = topScore;

  // console.log('Gen', ai.generation, 'best score was', topScore);

  ai.evolve();

  requestAnimationFrame(train);
}

ai.load({
  model: 'http://localhost:8080/model/mona/model.json',
  metadata: 'http://localhost:8080/model/mona/model_meta.json',
  weights: 'http://localhost:8080/model/mona/model.weights.bin',
}).then(() => {
  setTimeout(train, 1000);
});

let opts = {
  width: 400,
  height: 100,
  pxAlign: false,
  cursor: {
    show: false,
  },
  select: {
    show: false,
  },
  legend: {
    show: false,
  },
  scales: {
    x: {
      time: false,
    },
  },
  axes: [
    {
      show: false,
    },
    {
      show: false,
    },
  ],
  series: [
    {},
    {
      stroke: '#03a9f4',
      fill: '#b3e5fc',
    },
  ],
};

let uplot = new uPlot(opts, data, document.body);
