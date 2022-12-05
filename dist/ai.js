const input_node_count = 6;
const output_node_count = 4;
const decayRate = 0.99;

let learningRate = 0.3;
let mutateThreshold = 0.1;

class NeuralNetwork {
  constructor() {
    this.weights = [
      tf.randomNormal([input_node_count, 1024]),
      // tf.randomNormal([512, 256]),
      tf.randomNormal([1024, output_node_count]),
    ];
  }
  predict(user_input) {
    let output;
    // TODO: Build this with a better TS way...
    tf.tidy(() => {
      const input_layer = tf.tensor(user_input, [1, input_node_count]);
      const hidden_layer1 = input_layer.matMul(this.weights[0]).relu();
      // const hidden_layer2 = hidden_layer1.matMul(this.weights[1]).relu();
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
