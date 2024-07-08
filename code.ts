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
  // 変数の最初のモードのIDを取得
  // Figmaの変数は複数のモード（例：ライト/ダーク）を持つことがあるが、通常は最初のモードを使用
  const modeId = Object.keys(variable.valuesByMode)[0];

  // 指定されたモードでの変数の値を取得
  const value = variable.valuesByMode[modeId];
  console.log('value',value);
  
  
  // // 値がエイリアス（別の変数への参照）かどうかをチェック
  // if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
  //   // コレクション内のすべての変数IDに対して変数オブジェクトを非同期で取得
  //   // Promise.all を使用して並行処理を行い、効率的に全変数を取得
  //   const variables = await Promise.all(
  //     collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id))
  //   );
    
  //   // エイリアスが参照している変数を探す
  //   // find メソッドを使用して、エイリアスのIDと一致する変数を検索
  //   const aliasedVariable = variables.find(v => v?.id === value.id);
    
  //   // エイリアスが見つかった場合
  //   if (aliasedVariable) {
  //     // 再帰的に resolveColorAlias を呼び出し、エイリアスチェーンを解決
  //     // await を使用して、非同期処理の結果を待つ
  //     return await resolveColorAlias(aliasedVariable, collection);
  //   }
  // }
  
  // value が VariableAlias 型の場合の追加チェック
  // これは Figma API の仕様変更に対応するための処理
  if (typeof value === 'object' && 'id' in value) {
    // エイリアスが参照する変数を直接取得
    const resolvedVariable = await figma.variables.getVariableByIdAsync(value.id);
    console.log('value',value);
    console.log('value.id',value.id);
    console.log('resolvedVariable',resolvedVariable);
    
    if (resolvedVariable) {
      // 取得した変数に対して再帰的に色の解決を行う
      return await resolveColorAlias(resolvedVariable, collection);
    }
  }
  
  // エイリアスでない場合、または最終的な色の値に到達した場合
  // RGB値をHEX形式に変換して返す
  // as RGBA は TypeScript の型アサーションで、value が RGBA 型であることを明示的に指定
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
        // 1個1個のカラーバリアブルを回していて、今回しているバリアブルがどのコレクションに属しているかを調べている
        // 2個コレクションがあるなら1個違ったら、もう1個繰り返す
        const collection = collections.find(c => c.id === colorVariable.variableCollectionId);
        if (!collection) {
          throw new Error(`Collection not found for variable ${colorVariable.name}`);
        }
        // そのバリアブルと属しているコレクションを使うことでエイリアスの場合解決できる
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