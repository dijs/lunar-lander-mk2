const input_node_count = 6;
const output_node_count = 4;
const decayRate = 0.95;

let previous = false;

let learningRate = 0.3;
let mutateThreshold = 0.1;

const random = (min, max) => {
  var rand;

  rand = Math.random();

  if (typeof min === 'undefined') {
    return rand;
  } else if (typeof max === 'undefined') {
    if (min instanceof Array) {
      return min[Math.floor(rand * min.length)];
    } else {
      return rand * min;
    }
  } else {
    if (min > max) {
      var tmp = min;
      min = max;
      max = tmp;
    }
    return rand * (max - min) + min;
  }
};

const randomGaussian = (mean, sd) => {
  var y1, x1, x2, w;
  if (previous) {
    y1 = y2;
    previous = false;
  } else {
    do {
      x1 = random(2) - 1;
      x2 = random(2) - 1;
      w = x1 * x1 + x2 * x2;
    } while (w >= 1);
    w = Math.sqrt((-2 * Math.log(w)) / w);
    y1 = x1 * w;
    y2 = x2 * w;
    previous = true;
  }

  var m = mean || 0;
  var s = sd || 1;
  return y1 * s + m;
};

class NeuralNetwork {
  constructor() {
    this.weights = [
      tf.randomNormal([input_node_count, 256]),
      // tf.randomNormal([32, 16]),
      // tf.randomNormal([16, 8]),
      tf.randomNormal([256, output_node_count]),
    ];
  }
  predict(user_input) {
    let output;
    // TODO: Build this with a better TS way...
    tf.tidy(() => {
      const input_layer = tf.tensor(user_input, [1, input_node_count]);
      const hidden_layer1 = input_layer.matMul(this.weights[0]).relu();
      // const hidden_layer2 = hidden_layer1.matMul(this.weights[1]).sigmoid();
      // const hidden_layer3 = hidden_layer2.matMul(this.weights[2]).sigmoid();
      // TODO: Try softmax for output
      const output_layer = hidden_layer1.matMul(this.weights[1]).softmax();
      output = output_layer.dataSync();
    });
    return output;
  }
  clone() {
    return tf.tidy(() => {
      let clonie = new NeuralNetwork();
      clonie.dispose();
      clonie.weights = this.weights.map((w) => tf.clone(w));
      return clonie;
    });
  }
  dispose() {
    for (let w of this.weights) {
      w.dispose();
    }
  }
}

function fn_old(x) {
  if (random(1) < 0.05) {
    let offset = randomGaussian() * learningRate;
    return x + offset;
  }
  return x;
}

function fn(x) {
  if (Math.random() < mutateThreshold) {
    const r = (Math.random() - 0.5) * 2;
    const off = r * learningRate;
    return x + off;
  }
  return x;
}

function mutateNeuralNetwork(b) {
  let neuralNetwork = b.clone();

  neuralNetwork.weights = neuralNetwork.weights.map((layer) => {
    const tensor = tf.tensor(layer.dataSync().map(fn), layer.shape);
    layer.dispose();
    return tensor;
  });

  return neuralNetwork;
}

function crossoverNeuralNetwork(neuralNetworkOne, neuralNetworkTwo) {
  let parentA_in_dna = neuralNetworkOne.weights[0].dataSync();
  let parentA_out_dna = neuralNetworkOne.weights[1].dataSync();
  let parentB_in_dna = neuralNetworkTwo.weights[0].dataSync();
  let parentB_out_dna = neuralNetworkTwo.weights[1].dataSync();

  let mid = Math.floor(Math.random() * parentA_in_dna.length);
  let child_in_dna = [
    ...parentA_in_dna.slice(0, mid),
    ...parentB_in_dna.slice(mid, parentB_in_dna.length),
  ];
  let child_out_dna = [
    ...parentA_out_dna.slice(0, mid),
    ...parentB_out_dna.slice(mid, parentB_out_dna.length),
  ];

  let child = neuralNetworkOne.clone();
  let input_shape = neuralNetworkOne.weights[0].shape;
  let output_shape = neuralNetworkOne.weights[1].shape;

  child.dispose();

  child.weights[0] = tf.tensor(child_in_dna, input_shape);
  child.weights[1] = tf.tensor(child_out_dna, output_shape);

  return child;
}
