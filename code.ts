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

figma.showUI(__html__);
figma.ui.onmessage = async (msg: { type: string, count: number, value: string }) => {
  if (msg.type === 'get-colors') {
    try {
      const variables = await figma.variables.getLocalVariablesAsync();
      const colorVariables = variables.filter(variable => variable.resolvedType === 'COLOR');
      
      const colorVariableHex: colorVariableHex[] = colorVariables.map(colorVariable => {
        const rgba = Object.values(colorVariable.valuesByMode)[0]
        return {name: colorVariable.name, color: rgbToHex(rgba)}
      });

      const lines = msg.value.split('\n');
      const updatedLines = lines.map(line => {
        const scssVariablesRegex = /^\$/;
        const cssVariableRegex = /^--/;
        let regex;
        if (line.match(scssVariablesRegex)) {
          regex = /^\$(.*?):/;
        } else if (line.match(cssVariableRegex)) {
          regex = /^--(.*?):/;
        } else {
          regex = /^(?![/\d])(.*?):/;
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