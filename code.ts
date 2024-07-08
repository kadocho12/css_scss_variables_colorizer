interface colorVariableHex {
  name: string,
  color: string,
}

function rgbToHex(rgba: VariableValue) :string {
  const {r, g, b} = rgba as any;
  const r255 = Math.round(r * 255).toString(16).padStart(2, '0');
  const g255 = Math.round(g * 255).toString(16).padStart(2, '0');
  const b255 = Math.round(b * 255).toString(16).padStart(2, '0');
  return `#${r255}${g255}${b255}`;
}

async function resolveColorAlias(variable: Variable, collection: VariableCollection): Promise<string> {
  const modeId = Object.keys(variable.valuesByMode)[0];
  const value = variable.valuesByMode[modeId];
  if (typeof value === 'object' && 'id' in value) {
    const resolvedVariable = await figma.variables.getVariableByIdAsync(value.id);
    if (resolvedVariable) {
      return await resolveColorAlias(resolvedVariable, collection);
    }
  }
  return rgbToHex(value as RGBA);
}

figma.showUI(__html__, { width: 800, height: 400 });
figma.ui.onmessage = async (msg: { type: string, count: number, value: string }) => {
  if (msg.type === 'get-colors') {
    try {
      const variables = await figma.variables.getLocalVariablesAsync();
      const colorVariables = variables.filter(variable => variable.resolvedType === 'COLOR');

      const collections = await figma.variables.getLocalVariableCollectionsAsync();

      const colorVariableHex: colorVariableHex[] = await Promise.all(colorVariables.map(async colorVariable => {
        const collection = collections.find(c => c.id === colorVariable.variableCollectionId);
        if (!collection) {
          throw new Error(`Collection not found for variable ${colorVariable.name}`);
        }
        const color = await resolveColorAlias(colorVariable, collection);
        return {name: colorVariable.name, color};
      }));

      const lines = msg.value.split('\n');
      const updatedLines = lines.map(line => {
        const scssVariablesRegex = /^\s*\$/;
        const cssVariableRegex = /^\s*--/;
        let regex;
        if (line.match(scssVariablesRegex)) {
          regex = /^\s*\$(.*?):/;
        } else if (line.match(cssVariableRegex)) {
          regex = /^\s*--(.*?):/;
        } else {
          regex = /^\s*(?![/\d])(.*?):/;
        }

        const match = line.match(regex);
        if (match) {
          const variableName = match[1];
          const targetObject = colorVariableHex.find(item => item.name === variableName);
          if (targetObject) {
            const colorCodeRegex = /#.*?(?=\s|;|$)/;
            const match2 = line.match(colorCodeRegex);
            if (match2) {
              line = line.replace(match2[0], targetObject.color);
            }
          }
        }
        return line;
      });

      figma.ui.postMessage({ type: 'display-message', message: updatedLines.join('\n')});
    } catch (error) {
      console.error('Error', error);
    }
  }
};