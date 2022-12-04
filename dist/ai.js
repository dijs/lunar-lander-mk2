const input_node_count = 4;
const output_node_count = 3;

let previous = false;
let learningRate = 0.5;

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
      tf.randomNormal([input_node_count, 32]),
      tf.randomNormal([32, 16]),
      tf.randomNormal([16, 8]),
      tf.randomNormal([8, output_node_count]),
    ];
  }
  predict(user_input) {
    let output;
    // TODO: Build this with a better TS way...
    tf.tidy(() => {
      const input_layer = tf.tensor(user_input, [1, input_node_count]);
      const hidden_layer1 = input_layer.matMul(this.weights[0]).sigmoid();
      const hidden_layer2 = hidden_layer1.matMul(this.weights[1]).sigmoid();
      const hidden_layer3 = hidden_layer2.matMul(this.weights[2]).sigmoid();
      const output_layer = hidden_layer3.matMul(this.weights[3]).sigmoid();
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

function fn(x) {
  if (random(1) < 0.05) {
    let offset = randomGaussian() * learningRate;
    let newx = x + offset;
    return newx;
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
  let parentA_in_dna = neuralNetworkOne.input_weights.dataSync();
  let parentA_out_dna = neuralNetworkOne.output_weights.dataSync();
  let parentB_in_dna = neuralNetworkTwo.input_weights.dataSync();
  let parentB_out_dna = neuralNetworkTwo.output_weights.dataSync();

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
  let input_shape = neuralNetworkOne.input_weights.shape;
  let output_shape = neuralNetworkOne.output_weights.shape;

  child.dispose();

  child.input_weights = tf.tensor(child_in_dna, input_shape);
  child.output_weights = tf.tensor(child_out_dna, output_shape);

  return child;
}
