import FixWiring from './FixWiring.jsx'
import UploadData from './UploadData.jsx'
import EmptyGarbage from './EmptyGarbage.jsx'
import ClearAsteroids from './ClearAsteroids.jsx'
import InspectSample from './InspectSample.jsx'
import FuelEngines from './FuelEngines.jsx'
import AlignOutput from './AlignOutput.jsx'
import CalibrateDistributor from './CalibrateDistributor.jsx'
import UnlockManifolds from './UnlockManifolds.jsx'
import ChartCourse from './ChartCourse.jsx'
import StabilizeSteering from './StabilizeSteering.jsx'
import PrimeShields from './PrimeShields.jsx'
import PicturePuzzle from './PicturePuzzle.jsx'

/** `kind` dùng trong map / server / onOpenTask — 12 mini-game */
export const TASK_MINIGAME_COMPONENTS = {
  fix_wiring: FixWiring,
  upload_data: UploadData,
  empty_garbage: EmptyGarbage,
  clear_asteroids: ClearAsteroids,
  inspect_sample: InspectSample,
  fuel_engines: FuelEngines,
  align_output: AlignOutput,
  calibrate_distributor: CalibrateDistributor,
  unlock_manifolds: UnlockManifolds,
  chart_course: ChartCourse,
  stabilize_steering: StabilizeSteering,
  prime_shields: PrimeShields,
  picture_puzzle: PicturePuzzle,
}

export const TASK_MINIGAME_KINDS = Object.keys(TASK_MINIGAME_COMPONENTS)
