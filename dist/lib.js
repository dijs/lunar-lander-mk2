class Evolution {
  constructor({
    inputs,
    outputs,
    generationSize = 100,
    topSize = 10,
    learningRate = 0.02,
    crosstrain = true,
    ...networkOptions
  }) {
    this.nextNodeId = 0;
    this.nodes = {};
    this.generationSize = generationSize;
    this.topSize = topSize;
    this.generation = 1;
    this.learningRate = learningRate;
    this.currentTopId = -1;
    this.crosstrain = crosstrain;
    this.config = {
      inputs,
      outputs,
      task: 'classification',
      noTraining: true,
      ...networkOptions,
    };
  }

  createRandomGeneration() {
    for (let i = 0; i < this.generationSize; i++) {
      this.addRandomNode();
    }
  }

  getTopBrain() {
    return this.nodes[this.currentTopId].brain;
  }

  printTopWeights() {
    this.getTopBrain().neuralNetwork.model.layers[0].getWeights()[0].print();
  }

  save() {
    this.nodes[this.currentTopId].brain.save();
  }

  clearNodes() {
    for (let id in this.nodes) {
      this.nodes[id].brain.dispose();
    }
    this.nodes = {};
  }

  load(info) {
    return new Promise((resolve) => {
      const savedBrain = ml5.neuralNetwork(this.config);
      savedBrain.load(info, () => {
        // Upon successful load, remove all nodes
        this.clearNodes();
        // Add generation of clones
        for (let i = 0; i < this.generationSize; i++) {
          this.addNode(savedBrain.copy());
        }
        savedBrain.dispose();
        resolve();
      });
    });
  }

  addRandomNode() {
    return this.addNode(ml5.neuralNetwork(this.config));
  }

  addNode(brain) {
    const id = '' + this.nextNodeId;
    this.nextNodeId += 1;
    this.nodes[id] = {
      id,
      score: 0,
      survived: true,
      brain,
    };
    return id;
  }

  setScore(id, score) {
    // if (this.currentTopId === id && score < this.nodes[id].score) {
    // Do not allow the current top brain to fall in score
    //   return;
    // }
    this.nodes[id].score = score;
  }

  getAction(id, input) {
    if (this.config.task === 'classification') {
      const results = this.nodes[id].brain.classifySync(input);
      const action = results[0].label;
      return action;
    } else {
      const brain = this.nodes[id].brain;
      const meta = brain.neuralNetworkData.meta;
      const inputData = brain.formatInputsForPredictionAll(
        input,
        meta,
        Object.keys(meta.inputs)
      );
      const results = brain.neuralNetwork.classifySync(inputData);
      inputData.dispose();
      return results[0];
    }
  }

  getNodeKeys() {
    return Object.keys(this.nodes).filter((id) => this.nodes[id]);
  }

  evolve() {
    // Reset
    for (let id in this.nodes) {
      if (this.nodes[id]) {
        this.nodes[id].survived = false;
      }
    }
    // Sort
    const sorted = Object.keys(this.nodes)
      .filter((id) => this.nodes[id])
      .map((id) => ({
        id,
        score: this.nodes[id].score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.topSize);

    const topId = sorted[0].id;
    this.currentTopId = topId;

    console.log(
      'Top scores',
      sorted.map((e) => e.score)
    );

    // Keep top nodes
    for (let n of sorted) {
      this.nodes[n.id].survived = true;
    }
    // Remove rest
    for (let id in this.nodes) {
      if (this.nodes[id] && !this.nodes[id].survived) {
        this.nodes[id].brain.dispose();
        this.nodes[id] = undefined;
      }
    }

    // Breed next generation using best brain
    const topBrain = this.nodes[topId].brain;
    this.generation++;
    const survivedCount = sorted.length;
    // Generate nodes to replace who was lost
    for (let i = 0; i < this.generationSize - survivedCount; i++) {
      let brain;
      // Generate crossovers with top scorers
      if (this.crosstrain) {
        if (i < survivedCount) {
          const b = this.nodes[sorted[i].id].brain;
          if (Math.random() > 0.5) {
            brain = topBrain.crossover(b);
          } else {
            brain = b.crossover(topBrain);
          }
        } else {
          brain = topBrain.copy();
        }
      } else {
        brain = topBrain.copy();
      }
      brain.mutate(this.learningRate);
      this.addNode(brain);
    }
    // Return top score for fun
    return this.nodes[topId].score;
  }
}
