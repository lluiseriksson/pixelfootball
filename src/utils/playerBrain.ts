
import { NeuralNet, Position, TeamContext, Player } from '../types/football';
import { createNeuralInput, isNetworkValid } from './neuralHelpers';
import { createPlayerBrain } from './neuralNetwork';

export { createPlayerBrain, createUntrained } from './neuralNetwork';

export const updatePlayerBrain = (
  brain: NeuralNet,
  isScoring: boolean,
  ball: { position: Position, velocity: Position },
  player: Player,
  context: TeamContext
): NeuralNet => {
  if (!isNetworkValid(brain.net)) {
    console.warn(`Red neuronal ${player.team} ${player.role} #${player.id} apagada, reinicializando...`);
    return createPlayerBrain();
  }

  const input = createNeuralInput(ball, player.position, context);
  
  const rewardMultiplier = isScoring ? 2 : 1;
  let targetOutput;

  if (player.role === 'forward') {
    targetOutput = {
      moveX: (ball.position.x - player.position.x) > 0 ? 1 : -1,
      moveY: (ball.position.y - player.position.y) > 0 ? 1 : -1,
      shootBall: input.isInShootingRange,
      passBall: input.isInPassingRange,
      intercept: 0.2
    };
  } else if (player.role === 'midfielder') {
    targetOutput = {
      moveX: (ball.position.x - player.position.x) > 0 ? 0.8 : -0.8,
      moveY: (ball.position.y - player.position.y) > 0 ? 0.8 : -0.8,
      shootBall: input.isInShootingRange * 0.7,
      passBall: input.isInPassingRange * 1.2,
      intercept: 0.5
    };
  } else if (player.role === 'defender') {
    targetOutput = {
      moveX: (player.position.x - ball.position.x) > 0 ? -0.6 : 0.6,
      moveY: (player.position.y - ball.position.y) > 0 ? -0.6 : 0.6,
      shootBall: input.isInShootingRange * 0.3,
      passBall: input.isInPassingRange * 1.5,
      intercept: 0.8
    };
  } else { // goalkeeper
    // Calcular la distancia a la portería
    const distanceToGoal = Math.sqrt(
      Math.pow(player.position.x - context.ownGoal.x, 2) +
      Math.pow(player.position.y - context.ownGoal.y, 2)
    );

    // Calcular si el balón se dirige hacia la portería
    const ballMovingTowardsGoal = (
      player.team === 'red' && ball.velocity.x < 0 ||
      player.team === 'blue' && ball.velocity.x > 0
    );

    // Calcular la posición vertical óptima para el portero basada en la posición de la pelota
    const optimalY = context.ownGoal.y + (ball.position.y - context.ownGoal.y) * 0.8;
    const verticalAdjustment = (optimalY - player.position.y) / 50; // Aumentado de 100 a 50 para mayor velocidad

    // Determinar si el portero debe ser más agresivo
    const shouldBeAggressive = 
      (distanceToGoal < 200 || // Aumentado el rango de acción
      (Math.abs(ball.position.x - context.ownGoal.x) < 250 && ballMovingTowardsGoal)) && // Reaccionar antes
      Math.abs(ball.position.y - context.ownGoal.y) < 150; // Aumentado el rango vertical

    // Calcular la distancia máxima que el portero puede alejarse de la portería
    const maxXDistance = player.team === 'red' ? 100 : -100; // Aumentado de 80 a 100
    const currentXOffset = player.position.x - context.ownGoal.x;
    const xAdjustment = shouldBeAggressive ? 
      (ball.position.x - player.position.x) / 50 : // Aumentado para más velocidad
      -currentXOffset / 30;

    targetOutput = {
      moveX: shouldBeAggressive 
        ? Math.sign(ball.position.x - player.position.x)
        : Math.max(-1, Math.min(1, xAdjustment * 2)),
      moveY: shouldBeAggressive
        ? Math.sign(ball.position.y - player.position.y)
        : Math.max(-1, Math.min(1, verticalAdjustment * 3)),
      shootBall: 1, // Siempre intentar despejar
      passBall: input.isInPassingRange,
      intercept: 1 // Siempre intentar interceptar
    };
  }

  Object.keys(targetOutput).forEach(key => {
    targetOutput[key] *= rewardMultiplier;
  });

  brain.net.train([{
    input,
    output: targetOutput
  }], {
    iterations: 300,
    errorThresh: 0.001,
    learningRate: isScoring ? 0.1 : 0.03,
    log: true,
    logPeriod: 50
  });

  const currentOutput = brain.net.run(input);
  
  try {
    console.log(`Red neuronal ${player.team} ${player.role} #${player.id}:`, {
      input,
      output: currentOutput,
      targetOutput,
      weightsShape: brain.net.weights ? {
        inputToHidden1: brain.net.weights[0]?.length,
        hidden1ToHidden2: brain.net.weights[1]?.length,
        hidden2ToHidden3: brain.net.weights[2]?.length,
        hidden3ToOutput: brain.net.weights[3]?.length
      } : 'Red no entrenada'
    });
  } catch (error) {
    console.warn(`Error al acceder a los pesos de la red ${player.team} ${player.role} #${player.id}:`, error);
  }

  if (!isNetworkValid(brain.net)) {
    console.warn(`Red neuronal ${player.team} ${player.role} #${player.id} se volvió inválida después del entrenamiento, reinicializando...`);
    return createPlayerBrain();
  }

  return {
    net: brain.net,
    lastOutput: { 
      x: currentOutput.moveX || 0,
      y: currentOutput.moveY || 0
    },
    lastAction: currentOutput.shootBall > 0.7 ? 'shoot' :
                currentOutput.passBall > 0.7 ? 'pass' :
                currentOutput.intercept > 0.7 ? 'intercept' : 'move'
  };
};
