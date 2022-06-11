import { writable }        from 'svelte/store';

import { propertyStore }   from '@typhonjs-fvtt/runtime/svelte/store';

import { ControlStore }    from '../control/ControlStore.js';

export class ControlsStore
{
   #controls = [];

   /**
    * @type {Map<*, ControlStore>}
    */
   #controlMap = new Map();

   /**
    * @type {ControlsData}
    */
   #data = {
      boundingRect: void 0,
      enabled: false,
      validate: true
   };

   #selectedAPI;

   #selectedDragAPI;

   #stores;

   /**
    * Stores the subscribers.
    *
    * @type {(function(ControlStore[]): void)[]}
    */
   #subscriptions = [];

   constructor()
   {
      const dataStore = writable(this.#data);

      [this.#selectedAPI, this.#selectedDragAPI] = new SelectedAPI(this.#data);

      this.#stores = {
         boundingRect: propertyStore(dataStore, 'boundingRect'),
         enabled: propertyStore(dataStore, 'enabled'),
         validate: propertyStore(dataStore, 'validate')
      };

      Object.freeze(this.#stores);

      return [this, this.#selectedDragAPI];
   }

   /**
    * @returns {DOMRect} Returns any validation bounding rect.
    */
   get boundingRect() { return this.#data.boundingRect; }

   /**
    * @returns {boolean} Returns enabled state.
    */
   get enabled() { return this.#data.enabled; }

   /**
    * @returns {SelectedAPI} Selected API
    */
   get selected() { return this.#selectedAPI; }

   /**
    * @returns {*} Stores.
    */
   get stores() { return this.#stores; }

   /**
    * @returns {boolean} Returns if on-drag validation is enabled.
    */
   get validate() { return this.#data.validate; }

   /**
    * @param {DOMRect|void}  boundingRect - Assigns the validation bounding rect.
    */
   set boundingRect(boundingRect) { this.#stores.boundingRect.set(boundingRect); }

   /**
    * @param {boolean}  enabled - New enabled state.
    */
   set enabled(enabled) { this.#stores.enabled.set(enabled); }

   /**
    * @param {boolean}  validate - New on-drag validation state.
    */
   set validate(validate) { this.#stores.validate.set(validate); }

   /**
    * @returns {IterableIterator<any>} Keys for all controls.
    */
   keys()
   {
      return this.#controlMap.keys();
   }

   updateComponents(components)
   {
      const controlMap = this.#controlMap;
      const selected = this.#selectedAPI;

      const removeIDs = new Set(controlMap.keys());

      for (const component of components)
      {
         if (controlMap.has(component.id))
         {
            removeIDs.delete(component.id);
            continue;
         }

         controlMap.set(component.id, new ControlStore(component));
      }

      for (const id of removeIDs)
      {
         const control = controlMap.get(id);

         selected.removeById(id);
         controlMap.delete(id);

         // Remove subscriptions to Position instances.
         if (control) { control.destroy(); }
      }

      this.#controls = [...controlMap.values()];

      this.#updateSubscribers();
   }

   /**
    * @returns {IterableIterator<ControlStore>} All controls.
    */
   values()
   {
      return this.#controlMap.values();
   }

// -------------------------------------------------------------------------------------------------------------------

   #updateSubscribers()
   {
      const subscriptions = this.#subscriptions;

      // Early out if there are no subscribers.
      if (subscriptions.length > 0)
      {
         for (let cntr = 0; cntr < subscriptions.length; cntr++) { subscriptions[cntr](this.#controls); }
      }
   }

   /**
    *
    * @param {function(ControlStore[]): void} handler - Callback function that is invoked on update / changes.
    *
    * @returns {(function(): void)} Unsubscribe function.
    */
   subscribe(handler)
   {
      this.#subscriptions.push(handler); // add handler to the array of subscribers

      handler(this.#controls);           // call handler with current value

      // Return unsubscribe function.
      return () =>
      {
         const index = this.#subscriptions.findIndex((sub) => sub === handler);
         if (index >= 0) { this.#subscriptions.splice(index, 1); }
      };
   }
}

class SelectedAPI
{
   /**
    * Stores the main ControlStore data object.
    *
    * @type {ControlsData}
    */
   #data;

   /**
    * Initial bounding rect when drag starts.
    *
    * @type {DOMRect}
    */
   #dragBoundingRect = new DOMRect();

   /**
    * Data to send selected control position instances.
    *
    * @type {{top: number, left: number}}
    */
   #dragUpdate = { top: 0, left: 0 };

   /**
    * @type {ControlStore}
    */
   #primaryControl;

   /**
    * @type {Map<*, ControlStore>}
    */
   #selectedMap = new Map();

   /**
    * @type {Map<*, TransformData>}
    */
   #transformDataMap = new Map();

   /**
    * @type {Map<*, Function>}
    */
   #unsubscribeMap = new Map();

   /**
    * @type {Map<*, Function>}
    */
   #quickToMap = new Map();

   /**
    * @param {ControlsData} data - The main ControlStore data object.
    */
   constructor(data)
   {
      this.#data = data;

      const selectedDragAPI = {
         onStart: this.#onDragStart.bind(this),
         onMove: this.#onDragMove.bind(this)
      };

      return [this, selectedDragAPI];
   }

   /**
    * @param {ControlStore}   control - A control store.
    */
   add(control)
   {
      const controlId = control.id;

      this.#selectedMap.set(controlId, control);
      this.#quickToMap.set(controlId, control.position.animate.quickTo(['top', 'left'], { duration: 0.1 }));

      if (this.#primaryControl)
      {
         this.#primaryControl.isPrimary = false;
         this.#primaryControl = void 0;
      }

      this.#primaryControl = control;
      control.isPrimary = true;
      control.selected = true;

      const unsubscribe = control.position.stores.transform.subscribe(
       (data) => this.#transformDataMap.set(controlId, data));

      this.#unsubscribeMap.set(controlId, unsubscribe);
   }

   clear()
   {
      if (this.#primaryControl)
      {
         this.#primaryControl.isPrimary = false;
         this.#primaryControl = void 0;
      }

      for (const control of this.#selectedMap.values())
      {
         const unsubscribe = this.#unsubscribeMap.get(control.id);
         if (typeof unsubscribe === 'function') { unsubscribe(); }

         control.selected = false;
      }

      this.#transformDataMap.clear();
      this.#unsubscribeMap.clear();
      this.#quickToMap.clear();
      this.#selectedMap.clear();
   }

   /**
    * @returns {IterableIterator<[*, ControlStore]>} Selected control entries iterator.
    */
   entries()
   {
      return this.#selectedMap.entries();
   }

   /**
    * @returns {ControlStore} The primary control store.
    */
   getPrimary()
   {
      return this.#primaryControl;
   }

   /**
    * @returns {IterableIterator<*>} Selected control keys iterator.
    */
   keys()
   {
      return this.#selectedMap.keys();
   }

   #onDragMove(event)
   {
      let { tX, tY } = event.detail;

      const dragUpdate = this.#dragUpdate;

      const validationRect = this.#data.boundingRect;
      const validate = this.#data.validate;

      if (validate && validationRect)
      {
         const boundingRect = this.#dragBoundingRect;

         let x = boundingRect.x + tX;
         let y = boundingRect.y + tY;
         const left = boundingRect.left + tX;
         const right = boundingRect.right + tX;
         const bottom = boundingRect.bottom + tY;
         const top = boundingRect.top + tY;

         const initialX = x;
         const initialY = y;

         if (bottom > validationRect.bottom) { y += validationRect.bottom - bottom; }
         if (right > validationRect.right) { x += validationRect.right - right; }
         if (top < 0) { y += Math.abs(top); }
         if (left < 0) { x += Math.abs(left); }

         tX -= initialX - x;
         tY -= initialY - y;
      }

      // Add adjusted total X / Y added to initial positions for each control position.
      for (const quickTo of this.#quickToMap.values())
      {
         dragUpdate.left = quickTo.initialPosition.left + tX;
         dragUpdate.top = quickTo.initialPosition.top + tY;

         quickTo(dragUpdate);
      }
   }

   #onDragStart()
   {
      for (const controlId of this.keys())
      {
         const control = this.#selectedMap.get(controlId);
         const quickTo = this.#quickToMap.get(controlId);
         quickTo.initialPosition = control.position.get();
      }

      this.getBoundingRect(this.#dragBoundingRect);
   }

   /**
    * @param {ControlStore}   control - A control store.
    */
   remove(control)
   {
      if (this.#primaryControl === control)
      {
         this.#primaryControl.isPrimary = false;
         this.#primaryControl = void 0;
      }

      const controlId = control.id;

      if (this.#selectedMap.delete(controlId))
      {
         const unsubscribe = this.#unsubscribeMap.get(controlId);
         this.#unsubscribeMap.delete(controlId);

         if (typeof unsubscribe === 'function') { unsubscribe(); }

         this.#transformDataMap.delete(controlId);
         this.#quickToMap.delete(controlId);

         control.selected = false;
      }
   }

   /**
    * @param {*}   controlId - An ID for a control store to remove.
    */
   removeById(controlId)
   {
      if (this.#primaryControl?.id === controlId)
      {
         this.#primaryControl.isPrimary = false;
         this.#primaryControl = void 0;
      }

      const control = this.#selectedMap.get(controlId);

      if (control)
      {
         const unsubscribe = this.#unsubscribeMap.get(controlId);
         this.#unsubscribeMap.delete(controlId);

         if (typeof unsubscribe === 'function') { unsubscribe(); }

         this.#transformDataMap.delete(controlId);
         this.#quickToMap.delete(controlId);
         this.#selectedMap.delete(controlId);

         control.selected = false;
      }
   }

   setPrimary(control)
   {
      if (this.#primaryControl && this.#primaryControl !== control)
      {
         this.#primaryControl.isPrimary = false;
         this.#primaryControl = void 0;
      }

      this.#primaryControl = control;
      control.isPrimary = true;
   }

   /**
    * Processes all selected controls transformed bounds to create a single combined bounding rect.
    *
    * @param {DOMRect} [boundingRect] - A DOMRect to store calculations or one will be created.
    *
    * @returns {DOMRect} Bounding rect.
    */
   getBoundingRect(boundingRect = new DOMRect())
   {
      let maxX = Number.MIN_SAFE_INTEGER;
      let maxY = Number.MIN_SAFE_INTEGER;
      let minX = Number.MAX_SAFE_INTEGER;
      let minY = Number.MAX_SAFE_INTEGER;

      for (const transformData of this.#transformDataMap.values())
      {
         const controlRect = transformData.boundingRect;

         if (controlRect.right > maxX) { maxX = controlRect.right; }
         if (controlRect.left < minX) { minX = controlRect.left; }
         if (controlRect.bottom > maxY) { maxY = controlRect.bottom; }
         if (controlRect.top < minY) { minY = controlRect.top; }
      }

      boundingRect.x = minX;
      boundingRect.y = minY;
      boundingRect.width = maxX - minX;
      boundingRect.height = maxY - minY;

      return boundingRect;
   }

   /**
    * @returns {IterableIterator<Object>} Selected controls iterator.
    */
   values()
   {
      return this.#selectedMap.values();
   }
}

/**
 * @typedef {object} ControlsData
 *
 * @property {DOMRect} boundingRect -
 *
 * @property {boolean} enabled -
 *
 * @property {boolean} validate -
 */
