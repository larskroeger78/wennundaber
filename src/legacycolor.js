// three.js >= r152 rechnet Farben standardmaessig farbverwaltet. Das Spiel ist auf das alte Verhalten abgestimmt (Farben, Licht, eigener Tonwert-Shader).
// Dieses Modul muss vor allen anderen three-Zugriffen laufen und stellt das alte Verhalten wieder her.
import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
export default true;
