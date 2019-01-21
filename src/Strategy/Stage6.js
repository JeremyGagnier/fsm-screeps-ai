const PathManager = require('PathManager')
const StrategyUtil = require('Strategy.StrategyUtil')
const Builder = require('Creeps.Builder')

/**
 * Stage 6s purpose is to convert the rooms energy into control points as efficiently as possible.
 */
let Stage6
Stage6 =
{
  Initialize: () => {
    let room = Game.rooms[Memory.strategy.roomName]
    let roomIntel = Memory.intel[Memory.strategy.roomName]
    PathManager.PlaceRoads(room, roomIntel.spawnerToExtensionsPath)
    for (let pathIter in roomIntel.sourcePaths) {
      PathManager.PlaceRoads(room, roomIntel.sourcePaths[pathIter])
    }
    roomIntel.strategy = {
      refiller: roomIntel.refiller,
      harvesters: roomIntel.harvesters,
      haulers: roomIntel.haulers,
      builders: [],
      buildPathJobs: [],
      repairPathJobs: []
    }
    StrategyUtil.SetNumBuilders(roomIntel.strategy, roomIntel.sourcePositions.length)
    Stage6.CalculateBuilderJobs(room, roomIntel)
  },

  Advance: () => {
    let roomName = Memory.strategy.roomName
    let roomIntel = Memory.intel[roomName]
    let strategy = roomIntel.strategy
    let room = Game.rooms[roomName]
    let spawner = room.lookForAt(LOOK_STRUCTURES, roomIntel.spawnerPos.x, roomIntel.spawnerPos.y)[0]

    if (strategy.refiller !== null) {
      if (!Game.creeps[strategy.refiller]) {
        strategy.refiller = null
      }
    }

    let harvestJobs = []
    let haulJobs = []
    for (let i in strategy.haulers) {
      let harvesterName = strategy.harvesters[i]
      if (harvesterName !== null) {
        if (!Game.creeps[harvesterName]) {
          strategy.harvesters[i] = null
          harvestJobs.push(i)
        }
      } else {
        harvestJobs.push(i)
      }

      let haulerName = strategy.haulers[i]
      if (haulerName !== null) {
        if (!Game.creeps[haulerName]) {
          strategy.haulers[i] = null
          haulJobs.push(i)
        }
      } else {
        haulJobs.push(i)
      }
    }

    // Clear dead builders
    for (let i in strategy.builders) {
      let builderName = strategy.builders[i]
      if (builderName !== null && !Game.creeps[builderName]) {
        strategy.builders[i] = null
      }
    }

    // This calculation is fairly expensive so don't do it very often
    if ((Game.time % RARELY) === 0) {
      Stage6.CalculateBuilderJobs(room, roomIntel)
    }

    let jobIndex
    let maybeCreep = StrategyUtil.GetNextIdleCreep()
    while (maybeCreep) {
      switch (maybeCreep.memory.type) {
        case CREEP_INITIAL:
          let extensionPos = roomIntel.extensionsPos
          let diePos = extensionPos.x + ROOM_SIZE * extensionPos.y
          maybeCreep.SetDieJob(diePos)
          break

        case CREEP_MINER:
          jobIndex = harvestJobs.pop()
          strategy.harvesters[jobIndex] = maybeCreep.name
          maybeCreep.SetHarvestJob(roomIntel.sourcePositions[jobIndex], jobIndex)
          break

        case CREEP_HAULER:
          jobIndex = haulJobs.pop()
          strategy.haulers[jobIndex] = maybeCreep.name
          maybeCreep.SetDepositJob(jobIndex)
          break

        case CREEP_BUILDER:
          // Put the builder into the builder list if it isn't already.
          let insertIndex = -1
          for (let builderNameIter in strategy.builders) {
            let builderName = strategy.builders[builderNameIter]
            if (builderName === null) {
              insertIndex = builderNameIter
            } else if (builderName === maybeCreep.name) {
              insertIndex = -1
              break
            }
          }
          if (insertIndex !== -1) {
            strategy.builders[insertIndex] = maybeCreep.name
          }
          // Find a job for the builder. If no job is available upgrade the room controller.
          if (strategy.buildPathJobs.length > 0) {
            let jobIndex = strategy.buildPathJobs.pop()
            Builder.SetBuildPathJob(
              maybeCreep,
              jobIndex,
              roomIntel.extensionsPos.x + roomIntel.extensionsPos.y * ROOM_SIZE,
              roomIntel.sourcePaths[jobIndex])
          } else if (strategy.repairPathJobs.length > 0) {
            let jobIndex = strategy.repairPathJobs.pop()
            Builder.SetRepairPathJob(
              maybeCreep,
              jobIndex,
              roomIntel.extensionsPos.x + roomIntel.extensionsPos.y * ROOM_SIZE,
              roomIntel.sourcePaths[jobIndex])
          } else {
            Builder.SetUpgradeJob(maybeCreep, roomIntel.extensionsPos.x + roomIntel.extensionsPos.y * ROOM_SIZE)
          }
          break
      }
      maybeCreep = StrategyUtil.GetNextIdleCreep()
    }

    let numBuilders = 0
    for (let builderIter in strategy.builders) {
      if (strategy.builders[builderIter] !== null) {
        numBuilders += 1
      }
    }
    if (strategy.refiller === null) {
      spawner.TrySpawn([CARRY, CARRY, CARRY, CARRY, CARRY, MOVE], CREEP_REFILLER)
    } else if (haulJobs.length === harvestJobs.length && haulJobs.length !== 0) {
      spawner.TrySpawn(StrategyUtil.GetHaulerBody(roomIntel.sourcePaths[haulJobs[0]].length, 550), CREEP_HAULER)
    } else if (harvestJobs.length !== 0) {
      spawner.TrySpawn([WORK, WORK, WORK, WORK, WORK, MOVE], CREEP_MINER)
    } else if (numBuilders < strategy.builders.length) {
      spawner.TrySpawn([WORK, CARRY, CARRY, CARRY, MOVE, WORK, CARRY, MOVE], CREEP_BUILDER)
    }
  },

  CalculateBuilderJobs: (room, roomIntel) => {
    let strategy = roomIntel.strategy
    let buildPathJobs = []
    let repairPathJobs = []
    for (let pathsIter in roomIntel.sourcePaths) {
      let path = roomIntel.sourcePaths[pathsIter]
      let structures = path.map(pos => room.lookForAt(LOOK_STRUCTURES, pos[0], pos[1])[0])
      for (let structureIter in structures) {
        let structure = structures[structureIter]
        if (!structure) {
          if (buildPathJobs[buildPathJobs.length - 1] !== pathsIter) {
            buildPathJobs.push(pathsIter)
          }
          let pos = path[structureIter]
          if (structureIter === 0 || structureIter === path.length - 1) {
            room.createConstructionSite(pos[0], pos[1], STRUCTURE_CONTAINER)
          } else {
            room.createConstructionSite(pos[0], pos[1], STRUCTURE_ROAD)
          }
        } else if (structure.NeedsRepair()) {
          if (repairPathJobs[repairPathJobs.length - 1] !== pathsIter) {
            repairPathJobs.push(pathsIter)
          }
        }
      }
    }

    let newBuildPathJobs = []
    for (let jobIndexIter in buildPathJobs) {
      let jobIndex = buildPathJobs[jobIndexIter]
      let worked = false
      for (let i in strategy.builders) {
        let builderName = strategy.builders[i]
        if (builderName !== null) {
          let creep = Game.creeps[builderName]
          if (creep.memory.jobType === 1 && creep.memory.jobIndex === jobIndex) {
            worked = true
            break
          }
        }
      }
      if (!worked) {
        newBuildPathJobs.push(jobIndex)
      }
    }
    buildPathJobs = newBuildPathJobs

    let newRepairPathJobs = []
    for (let jobIndexIter in repairPathJobs) {
      let jobIndex = repairPathJobs[jobIndexIter]
      let worked = false
      for (let i in strategy.builders) {
        let builderName = strategy.builders[i]
        if (builderName !== null) {
          let creep = Game.creeps[builderName]
          if (creep.memory.jobType === 2 && creep.memory.jobIndex === jobIndex) {
            worked = true
            break
          }
        }
      }
      if (!worked) {
        newRepairPathJobs.push(jobIndex)
      }
    }
    repairPathJobs = newRepairPathJobs

    strategy.buildPathJobs = buildPathJobs
    strategy.repairPathJobs = repairPathJobs
  },

  FromStage5ToStage6: () => {
    let roomIntel = Memory.intel[Memory.strategy.roomName]
    let shouldTransition = roomIntel.refiller !== null &&
            !roomIntel.haulers.includes(null) &&
            !roomIntel.harvesters.includes(null)
    if (shouldTransition) {
      Stage6.Initialize()
    }
    return shouldTransition
  }
}

module.exports = Stage6
