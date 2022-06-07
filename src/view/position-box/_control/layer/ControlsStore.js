import { ControlStore } from "../control/ControlStore.js";

class ControlsStore
{
   /**
    * Stores the subscribers.
    *
    * @type {(function(PositionData): void)[]}
    */
   #subscriptions = [];

   #controls = [];

   #controlMap = new Map();

   #selected = new Set();

   #dragUpdate = { left: '', top: '' };

   #selectedAPI = new SelectedAPI(this.#selected);

   constructor()
   {

   }

   /**
    * @returns {SelectedAPI} Selected API
    */
   get selected() { return this.#selectedAPI; }

   dragging(dX, dY)
   {
      const dragUpdate = this.#dragUpdate;

      for (const control of this.#selected)
      {
         dragUpdate.left = `${dX >= 0 ? '+' : '' }${dX}`;
         dragUpdate.top = `${dY >= 0 ? '+' : '' }${dY}`;

         control.position.set(dragUpdate);
      }
   }

   updateComponents(components)
   {
      const controlMap = this.#controlMap;

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

      for (const id of removeIDs) { controlMap.delete(id); }

      this.#controls = [...this.#controlMap.values()];

      this.#updateSubscribers();
   }

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
    * @type {Set<object>}
    */
   #selected;

   constructor(selected)
   {
      this.#selected = selected;
   }

   add(control)
   {
      this.#selected.add(control);
      control.selected = true;
   }

   clear()
   {
      for (const control of this.#selected) { control.selected = false; }
      this.#selected.clear();
   }

   remove(control)
   {
      if (this.#selected.delete(control))
      {
         control.selected = false;
         this.#selected.delete(control);
      }
   }

   set(control)
   {
      control.selected = true;

      // Remove this control from the selected set.
      this.#selected.delete(control);

      // Set all other selected controls to false.
      for (const entry of this.#selected) { entry.selected = false; }

      this.#selected.clear();

      this.#selected.add(control);
   }
}

export const controls = new ControlsStore();