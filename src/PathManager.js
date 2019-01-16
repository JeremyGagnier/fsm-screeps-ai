const ExtensionManager = require('ExtensionManager')
const SpawnManager = require('SpawnManager')

let PathManager = null
PathManager =
{
  GetSpawnerToExtensionPath: (roomName, extensionsPos, spawnerPos) => {
    let spawnerRoadPos = SpawnManager.GetRoadPosition(spawnerPos)
    let pathData = PathFinder.search(
      new RoomPosition(spawnerRoadPos[0], spawnerRoadPos[1], roomName),
      {
        pos: new RoomPosition(extensionsPos.x, extensionsPos.y, roomName),
        range: 0
      },
      {
        plainCost: 2,
        swampCost: 5,
        roomCallback: roomName => PathManager.RoomCostMatrix(extensionsPos, spawnerPos)
      })
    if (pathData.incomplete) {
      console.log('Failed to find a path from the spawner to the extensions in ' +
                pathData.ops.toString() +
                ' ops.')
      return null
    }
    let path = pathData.path.map(roomPos => [roomPos.x, roomPos.y])
    path.unshift(spawnerRoadPos)
    return path
  },

  GetSourcePaths: (roomName, extensionsPos, spawnerPos, sourcePositions, spawnerToExtensionsPath) => {
    let paths = []
    for (let posIter in sourcePositions) {
      let sourceX = sourcePositions[posIter] % ROOM_SIZE
      let sourceY = ~~(sourcePositions[posIter] / ROOM_SIZE)
      let pathData = PathFinder.search(
        new RoomPosition(extensionsPos.x, extensionsPos.y, roomName),
        {
          pos: new RoomPosition(sourceX, sourceY, roomName),
          range: 1
        },
        {
          plainCost: 2,
          swampCost: 5,
          roomCallback: (roomName) => {
            PathManager.RoomCostMatrix(extensionsPos, spawnerPos, spawnerToExtensionsPath, paths)
          }
        })
      if (pathData.incomplete) {
        console.log('Failed to find a path from the extensions to the source at ' +
                    sourceX.toString() +
                    ', ' +
                    sourceY.toString() +
                    ' in ' +
                    pathData.ops.toString() +
                    ' ops.')
        paths.push(null)
      }
      let path = pathData.path.map(roomPos => [roomPos.x, roomPos.y])
      path.unshift([extensionsPos.x, extensionsPos.y])
      paths.push(path)
    }
    return paths
  },

  RoomCostMatrix: (extensionsPos, spawnerPos, spawnerToExtensionsPath, sourcePaths) => {
    let costs = new PathFinder.CostMatrix()

    // Block off areas around the spawn reserved for buildings
    let blockedPositions = SpawnManager.GetBlockedPositions(spawnerPos)
    for (let posIter in blockedPositions) {
      let pos = blockedPositions[posIter]
      costs.set(pos[0], pos[1], 0xff)
    }

    // Block off where the extensions will be built
    for (let i = 0; i < 30; ++i) {
      let pos = ExtensionManager.GetTransformedPosition(i, extensionsPos)
      costs.set(pos[0], pos[1], 0xff)
    }

    // Incentivize re-use of roads
    if (spawnerToExtensionsPath !== null) {
      for (let posIter in spawnerToExtensionsPath) {
        let pos = spawnerToExtensionsPath[posIter]
        costs.set(pos[0], pos[1], 1)
      }
    }

    if (sourcePaths) {
      for (let pathIter in sourcePaths) {
        let path = sourcePaths[pathIter]
        for (let posIter in path) {
          let pos = path[posIter]
          costs.set(pos[0], pos[1], 1)
        }
      }
    }

    return costs
  },

  PlaceRoads: (room, path) => {
    for (let posIter = 1; posIter < path.length - 1; ++posIter) {
      let pos = path[posIter]
      room.createConstructionSite(pos[0], pos[1], STRUCTURE_ROAD)
    }
  }
}

module.exports = PathManager
