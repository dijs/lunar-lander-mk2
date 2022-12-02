const input_node_count = 1;
const hidden_node_count = 16;
const output_node_count = 3;

class NeuralNetwork {
  constructor() {
    // Initialize random weights
    this.input_weights = tf.randomNormal([input_node_count, hidden_node_count]);
    this.output_weights = tf.randomNormal([
      hidden_node_count,
      output_node_count,
    ]);
  }
  predict(user_input) {
    let output;
    tf.tidy(() => {
      const input_layer = tf.tensor(user_input, [1, input_node_count]);
      const hidden_layer = input_layer.matMul(this.input_weights).sigmoid();
      const output_layer = hidden_layer.matMul(this.output_weights).sigmoid();
      output = output_layer.dataSync();
    });
    return output;
  }
}
